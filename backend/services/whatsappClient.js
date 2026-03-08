import { default as makeWASocket, DisconnectReason, Browsers, delay as baileysDelay, fetchLatestWaWebVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import { commands } from "../commands/index.js";
import { handleGroupParticipantsUpdate, handleGroupMessage } from "./groupEventHandler.js";
import { addAutoReaction, getRandomEmoji } from "../utils/reactionUtils.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import Notification from "../models/Notification.js";
import { useMongoDBAuthState } from "./mongoAuthState.js";
import { queueService } from "./queueService.js";
import { emitToUser, emitUpdate } from "./socketService.js";

// Cache the WhatsApp Web protocol version at module load
// The version hardcoded in Baileys is outdated and gets rejected with 405
let cachedWaVersion = null;
async function getWaVersion() {
    if (cachedWaVersion) return cachedWaVersion;
    try {
        const { version } = await fetchLatestWaWebVersion({});
        cachedWaVersion = version;
        console.log(`[WA Version] Fetched: ${version.join('.')}`);
    } catch (e) {
        console.warn(`[WA Version] Fetch failed, using fallback`);
        cachedWaVersion = [2, 3000, 1034408607]; // Known working version
    }
    return cachedWaVersion;
}
// Pre-fetch on module load
getWaVersion();
const pairingTimeoutMs = Number.parseInt(process.env.PAIRING_TIMEOUT_MS || "120000", 10);
/**
 * Multi-Tenant WhatsApp Session Manager
 * Manages multiple concurrent Baileys socket connections, one per user session.
 */
class SessionManager {
    constructor() {
        // Map<dbSessionId, { sock, reconnectAttempts, configCache, configCacheTime }>
        this.sessions = new Map();
        this.MAX_RECONNECT_ATTEMPTS = 10;
        this.CONFIG_CACHE_TTL = 5000;
    }

    /**
     * Get config for a specific session from DB with caching
     */
    async getSessionConfig(sessionId) {
        const entry = this.sessions.get(sessionId);
        const now = Date.now();

        if (entry?.configCache && (now - entry.configCacheTime < this.CONFIG_CACHE_TTL)) {
            return entry.configCache;
        }

        const session = await WhatsAppSession.findById(sessionId);
        if (!session) return null;

        const config = {
            phone: session.phone,
            name: session.name,
            prefix: session.settings?.prefix || "!",
            alwaysOnline: session.settings?.alwaysOnline || false,
            autoLikeStatus: session.settings?.autoLikeStatus || false,
            autoViewStatus: session.settings?.autoViewStatus || false,
            antiDelete: session.settings?.antiDelete || false,
            antiCall: session.settings?.antiCall || false,
            autoReadMessages: session.settings?.autoReadMessages || false,
            alwaysTyping: session.settings?.alwaysTyping || false,
            alwaysRecording: session.settings?.alwaysRecording || false,
            ownerNumber: session.phone
        };

        if (entry) {
            entry.configCache = config;
            entry.configCacheTime = now;
        }

        return config;
    }

    invalidateConfigCache(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry) {
            entry.configCache = null;
            entry.configCacheTime = 0;
        }
    }

    isConnected(sessionId) {
        const entry = this.sessions.get(sessionId);
        return entry?.sock?.user ? true : false;
    }

    getActiveCount() {
        let count = 0;
        for (const [, entry] of this.sessions) {
            if (entry.sock?.user) count++;
        }
        return count;
    }

    /**
     * Create and connect a WhatsApp client for a given DB session
     */
    async connectSession(sessionId) {
        const dbSession = await WhatsAppSession.findById(sessionId);
        if (!dbSession) {
            console.error(`❌ [${sessionId}] Session not found in DB.`);
            return null;
        }

        const { state, saveCreds } = await useMongoDBAuthState(sessionId);

        console.log(`🔌 [${sessionId}] Creating WhatsApp socket...`);

        const waVersion = await getWaVersion();
        console.log(`[${sessionId}] Using WA Web version: ${waVersion.join('.')}`);

        const sock = makeWASocket({
            logger: pino({ level: "silent" }),
            auth: state,
            version: waVersion,
            browser: Browsers.ubuntu("Chrome"),
            syncFullHistory: false,
            defaultQueryTimeoutMs: 180000,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 3000,
            qrTimeout: 60000,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                const entry = this.sessions.get(sessionId);
                return entry?.messageCache?.get(key.id)?.message;
            }
        });

        // Store sessionId on the socket for downstream command usage
        sock.sessionId = sessionId;

        // Auto reactions
        addAutoReaction(sock);

        // Store session entry
        this.sessions.set(sessionId, {
            sock,
            reconnectAttempts: 0,
            configCache: null,
            configCacheTime: 0,
            messageCache: new Map()
        });

        // Save creds on update
        sock.ev.on("creds.update", async () => {
            await saveCreds();
        });

        // Connection updates
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            const entry = this.sessions.get(sessionId);

            if (connection === "connecting") {
                console.log(`🔌 [${sessionId}] Connecting...`);
            }

            if (connection === "open") {
                console.log(`✅ [${sessionId}] Connected!`);
                if (entry) entry.reconnectAttempts = 0;
                try {
                    await saveCreds();
                } catch (error) {
                    console.error(`[${sessionId}] Failed to persist auth creds on open:`, error.message);
                }

                // Update DB safely, maintaining paused state if it exists
                const phone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0];
                const liveDbSession = await WhatsAppSession.findById(sessionId);

                const dbUpdates = {
                    phone: phone || dbSession.phone,
                    name: sock.user?.name || "Bot User",
                    lastConnected: new Date()
                };

                if (liveDbSession?.status !== "paused") {
                    dbUpdates.status = "active";
                }

                await WhatsAppSession.findByIdAndUpdate(sessionId, dbUpdates);
                emitToUser(dbSession.userId?.toString?.() || String(dbSession.userId), "session_update", {
                    sessionId,
                    status: liveDbSession?.status === "paused" ? "paused" : "active",
                    isLive: true
                });
                emitUpdate("admin_session_updated", {
                    sessionId,
                    status: liveDbSession?.status === "paused" ? "paused" : "active"
                });

                // Always Online heartbeat
                if (sock.onlineInterval) clearInterval(sock.onlineInterval);
                sock.onlineInterval = setInterval(async () => {
                    const config = await this.getSessionConfig(sessionId);
                    if (config?.alwaysOnline && sock.ws?.readyState === 1) {
                        try { await sock.sendPresenceUpdate("available"); } catch (e) { }
                    }
                }, 30000);
            }

            if (connection === "close") {
                if (sock.onlineInterval) clearInterval(sock.onlineInterval);

                const error = lastDisconnect?.error;
                const statusCode = error?.output?.statusCode;
                const errorMessage = error?.message || "";
                const lowerError = String(errorMessage).toLowerCase();

                const isLoggedOut = statusCode === DisconnectReason.loggedOut || lowerError.includes("logged out");
                const isConflict = errorMessage.includes("conflict") ||
                    statusCode === DisconnectReason.connectionReplaced;

                console.log(`❌ [${sessionId}] Connection closed. Code: ${statusCode}`);

                if (isLoggedOut) {
                    console.log(`🔓 [${sessionId}] Logged out session. Clearing stored auth state.`);
                    await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
                    await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
                    emitToUser(dbSession.userId?.toString?.() || String(dbSession.userId), "session_update", {
                        sessionId,
                        status: "disconnected",
                        isLive: false
                    });
                    emitUpdate("admin_session_updated", {
                        sessionId,
                        status: "disconnected"
                    });
                    this.sessions.delete(sessionId);
                } else if (isConflict) {
                    console.log(`⚠️ [${sessionId}] Session conflict.`);
                    await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
                    emitToUser(dbSession.userId?.toString?.() || String(dbSession.userId), "session_update", {
                        sessionId,
                        status: "disconnected",
                        isLive: false
                    });
                    emitUpdate("admin_session_updated", {
                        sessionId,
                        status: "disconnected"
                    });
                    this.sessions.delete(sessionId);
                } else if (entry && entry.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
                    entry.reconnectAttempts++;
                    const delay = Math.min(5000 * Math.pow(1.5, entry.reconnectAttempts), 60000);
                    console.log(`🔄 [${sessionId}] Reconnecting in ${delay / 1000}s (${entry.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(() => this.connectSession(sessionId), delay);
                } else {
                    console.log(`❌ [${sessionId}] Max reconnection attempts reached.`);
                    const currentStatusCheck = await WhatsAppSession.findById(sessionId);
                    if (currentStatusCheck?.status !== "paused") {
                        await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
                        emitToUser(dbSession.userId?.toString?.() || String(dbSession.userId), "session_update", {
                            sessionId,
                            status: "disconnected",
                            isLive: false
                        });
                        emitUpdate("admin_session_updated", {
                            sessionId,
                            status: "disconnected"
                        });

                        // Notify user about persistent disconnection
                        try {
                            const dbSession = await WhatsAppSession.findById(sessionId);
                            if (dbSession) {
                                await Notification.create({
                                    userId: dbSession.userId,
                                    title: "Device Disconnected",
                                    message: `Your device for ${dbSession.phone || "unknown number"} has disconnected and failed to reconnect. Please check your dashboard.`,
                                    type: "error",
                                    link: "/dashboard/pair"
                                });
                            }
                        } catch (err) {
                            console.error("Failed to create disconnection notification:", err);
                        }
                    }
                    this.sessions.delete(sessionId);
                }
            }
        });

        // Anti-Call
        sock.ev.on("call", async (node) => {
            const config = await this.getSessionConfig(sessionId);
            if (!config?.antiCall) return;
            for (const call of node) {
                if (call.status === "offer") {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, {
                            text: "📵 *Tervux Bot*\n\nCalls are automatically rejected. Please send a text message instead."
                        });
                    } catch (err) { console.error(`[${sessionId}] Anti-Call error:`, err.message); }
                }
            }
        });

        // Group events
        sock.ev.on("group-participants.update", async (update) => {
            await handleGroupParticipantsUpdate(sock, update);
        });

        // Status auto-actions
        sock.ev.on("messages.upsert", async ({ messages }) => {
            for (const m of messages) {
                if (m.key.remoteJid === "status@broadcast" && !m.key.fromMe) {
                    if (m.message?.protocolMessage || m.message?.reactionMessage) continue;
                    const config = await this.getSessionConfig(sessionId);
                    const participant = m.key.participant || m.participant;
                    try {
                        if (config?.autoViewStatus) await sock.readMessages([m.key]);
                        if (config?.autoLikeStatus) {
                            const emoji = getRandomEmoji();
                            await sock.sendMessage(m.key.remoteJid, {
                                react: { text: emoji, key: m.key }
                            }, { statusJidList: [participant] });
                        }
                    } catch (err) { }
                }
            }
        });

        // Anti-Delete cache
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const entry = this.sessions.get(sessionId);
            if (!entry) return;
            for (const m of messages) {
                if (!m.message || m.message.protocolMessage || m.message.reactionMessage || m.message.pollUpdateMessage) continue;
                const msgType = Object.keys(m.message)[0];
                const validTypes = [
                    'conversation', 'extendedTextMessage', 'imageMessage',
                    'videoMessage', 'audioMessage', 'documentMessage',
                    'stickerMessage', 'contactMessage', 'locationMessage',
                    'viewOnceMessage', 'viewOnceMessageV2', 'ephemeralMessage'
                ];
                if (validTypes.includes(msgType)) {
                    entry.messageCache.set(m.key.id, m);
                    if (entry.messageCache.size > 500) {
                        const firstKey = entry.messageCache.keys().next().value;
                        entry.messageCache.delete(firstKey);
                    }
                }
            }
        });

        // Anti-Delete restore
        sock.ev.on("messages.update", async (updates) => {
            const config = await this.getSessionConfig(sessionId);
            const entry = this.sessions.get(sessionId);
            if (!entry) return;

            for (const update of updates) {
                let deletedId = null;
                // Method 1: messageStubType
                if (update.update?.messageStubType === 1 && update.update?.message === null) {
                    const possibleIds = [
                        update.update?.key?.id, update.key?.id,
                        update.update?.messageStubParameters?.[0]
                    ].filter(Boolean);
                    for (const id of possibleIds) {
                        if (entry.messageCache.has(id)) { deletedId = id; break; }
                    }
                }
                // Method 2: protocolMessage
                const protocolMsg = update.update?.protocolMessage ||
                    update.update?.message?.protocolMessage ||
                    update.message?.protocolMessage;
                if (!deletedId && protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 5 || protocolMsg.type === "REVOKE")) {
                    deletedId = protocolMsg.key?.id;
                }

                if (deletedId) {
                    const originalMsg = entry.messageCache.get(deletedId);
                    if (originalMsg) {
                        const chatJid = originalMsg.key.remoteJid;
                        const isGroup = chatJid?.endsWith("@g.us");
                        if (isGroup) {
                            const { loadGroupSettings } = await import("./groupSettingsService.js");
                            const groupSettings = await loadGroupSettings(sessionId, chatJid);
                            if (!groupSettings.groupAntiDelete?.enabled) continue;
                        } else {
                            if (!config?.antiDelete) continue;
                        }
                        if (originalMsg.key.fromMe) continue;
                        await this._restoreDeletedMessage(sock, originalMsg, deletedId);
                    }
                }
            }
        });

        // Command Handler
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            for (const m of messages) {
                if (!m.message) continue;

                const messageText = m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    m.message.imageMessage?.caption ||
                    m.message.videoMessage?.caption || "";

                if (await handleGroupMessage(sock, m)) continue;

                const config = await this.getSessionConfig(sessionId);
                const prefix = config?.prefix || "!";

                if (!messageText.startsWith(prefix)) {
                    // Still handle auto-read and presence
                    if (config?.autoReadMessages && !m.key.fromMe) {
                        sock.readMessages([m.key]).catch(() => { });
                    }
                    if (config?.alwaysTyping && !m.key.fromMe) {
                        sock.sendPresenceUpdate("composing", m.key.remoteJid).catch(() => { });
                    } else if (config?.alwaysRecording && !m.key.fromMe) {
                        sock.sendPresenceUpdate("recording", m.key.remoteJid).catch(() => { });
                    }
                    continue;
                }

                // Check sender is the session owner
                const senderJid = m.key.participant || m.key.remoteJid;
                const botNumber = sock.user?.id?.split("@")[0]?.split(":")[0];
                const senderNumber = senderJid.split("@")[0].split(":")[0];
                const isOwner = m.key.fromMe || (senderNumber === botNumber) || (senderNumber === config?.ownerNumber?.replace(/\D/g, ""));

                if (!isOwner) {
                    await sock.sendMessage(m.key.remoteJid, {
                        text: `╔══════════════════════════════════╗
║  🚫 *𝔸ℂℂ𝔼𝕊𝕊 𝔻𝔼ℕ𝕀𝔼𝔻* 🚫  ║
╚══════════════════════════════════╝

⚠️ *𝕆𝕠𝕡𝕤!* This is a private Tervux Bot instance.
Only the owner can execute commands here.

✨ Get your own bot at bot.tervux.com

╔══════════════════════════════════╗
║    💠 *ℙ𝕠𝕨𝕖𝕣𝕖𝕕 𝕓𝕪 𝕋𝔼ℝ𝕍𝕌𝕏* 💠    ║
╚══════════════════════════════════╝`
                    }, { quoted: m });
                    continue;
                }

                // Parse & execute command
                const args = messageText.slice(prefix.length).trim().split(/ +/);
                const commandName = args.shift().toLowerCase();

                if (commands[commandName]) {
                    // Fetch Session Data
                    const dbSession = await WhatsAppSession.findById(sessionId);

                    // Pause Check
                    if (dbSession?.status === "paused") {
                        await sock.sendMessage(m.key.remoteJid, {
                            text: `╔══════════════════════════════════╗
║     ⏸️ *𝔹𝕆𝕋 𝕀𝕊 ℙ𝔸𝕌𝕊𝔼𝔻* ⏸️      ║
╚══════════════════════════════════╝

Hello! This Tervux Bot instance has been temporarily paused by its owner. 

⚠️ It cannot respond to any commands right now.

*Please wait for the administrator to resume the deployment.*

╔══════════════════════════════════╗
║    💠 *ℙ𝕠𝕨𝕖𝕣𝕖𝕕 𝕓𝕪 𝕋𝔼ℝ𝕍𝕌𝕏* 💠    ║
╚══════════════════════════════════╝`
                        }, { quoted: m });
                        continue;
                    }

                    // Deployment Check
                    const isDeployed = dbSession?.expiresAt && new Date(dbSession.expiresAt) > new Date();

                    if (!isDeployed) {
                        await sock.sendMessage(m.key.remoteJid, {
                            text: `╔══════════════════════════════════╗
║  ⚠️ *𝔻𝔼ℙ𝕃𝕆𝕐𝕄𝔼ℕ𝕋 ℝ𝔼ℚ𝕌𝕀ℝ𝔼𝔻* ⚠️  ║
╚══════════════════════════════════╝

Hi! Your WhatsApp is connected, but you need to deploy this node to use bot commands.

⏳ *Notice:* Undeployed sessions are automatically deleted after 24 hours to save resources.

✨ Please visit your dashboard to deploy:
*bot.tervux.com/dashboard/deployments*

╔══════════════════════════════════╗
║    💠 *ℙ𝕠𝕨𝕖𝕣𝕖𝕕 𝕓𝕪 𝕋𝔼ℝ𝕍𝕌𝕏* 💠    ║
╚══════════════════════════════════╝`
                        }, { quoted: m });
                        continue;
                    }

                    try {
                        console.log(`⚡ [${sessionId}] Command: ${commandName}`);
                        const result = await commands[commandName](sock, m, args);
                        if (result) {
                            const footer = `\n\n━━━━━━━━━━━━━━━━━━━━\n💠 *ℙ𝕠𝕨𝕖𝕣𝕖𝕕 𝕓𝕪 𝕋𝔼ℝ𝕍𝕌𝕏 𝔹𝕠𝕥*`;
                            if (typeof result === "string") {
                                await sock.sendMessage(m.key.remoteJid, { text: result + footer });
                            } else if (typeof result === "object") {
                                if (result.caption) result.caption += footer;
                                else if (result.text) result.text += footer;
                                await sock.sendMessage(m.key.remoteJid, result);
                            }
                        }
                    } catch (err) {
                        console.error(`❌ [${sessionId}] Command error (${commandName}):`, err.message);
                        await sock.sendMessage(m.key.remoteJid, {
                            text: `❌ Error executing command: ${err.message}`
                        });
                    }
                }

                // Auto-read and presence
                if (config?.autoReadMessages && !m.key.fromMe) {
                    sock.readMessages([m.key]).catch(() => { });
                }
                if (config?.alwaysTyping && !m.key.fromMe) {
                    sock.sendPresenceUpdate("composing", m.key.remoteJid).catch(() => { });
                } else if (config?.alwaysRecording && !m.key.fromMe) {
                    sock.sendPresenceUpdate("recording", m.key.remoteJid).catch(() => { });
                }
            }
        });

        return sock;
    }

    /**
     * Helper: Restore deleted message
     */
    async _restoreDeletedMessage(sock, originalMsg, deletedId) {
        try {
            const sender = originalMsg.key.participant || originalMsg.key.remoteJid;
            const senderName = sender.split("@")[0];
            const timestamp = new Date().toLocaleString("en-US", {
                hour: "2-digit", minute: "2-digit", hour12: true
            });

            let msgContent = originalMsg.message;
            if (msgContent?.viewOnceMessage) msgContent = msgContent.viewOnceMessage.message;
            if (msgContent?.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message;
            if (msgContent?.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message;

            const type = Object.keys(msgContent || {})[0];
            let text = "", msgTypeDisplay = "📝 Text";

            if (type === "conversation") text = msgContent.conversation || "";
            else if (type === "extendedTextMessage") text = msgContent.extendedTextMessage?.text || "";
            else if (type === "imageMessage") { text = msgContent.imageMessage?.caption || "[No Caption]"; msgTypeDisplay = "🖼️ Image"; }
            else if (type === "videoMessage") { text = msgContent.videoMessage?.caption || "[No Caption]"; msgTypeDisplay = "🎬 Video"; }
            else if (type === "documentMessage") { text = msgContent.documentMessage?.fileName || "[Unknown File]"; msgTypeDisplay = "📄 Document"; }
            else if (type === "audioMessage") { text = "[Voice Message]"; msgTypeDisplay = "🎤 Voice"; }
            else if (type === "stickerMessage") { text = "[Sticker]"; msgTypeDisplay = "🎭 Sticker"; }
            else { text = `[${type || "Unknown"} message]`; msgTypeDisplay = "❓ Unknown"; }

            const output = `╔══════════════════════════════════╗
║ 🛡️ *𝕋𝔼ℝ𝕍𝕌𝕏 𝔸ℕ𝕋𝕀-𝔻𝔼𝕃𝔼𝕋𝔼* 🛡️   ║
╚══════════════════════════════════╝

👤 *𝕊𝕖𝕟𝕕𝕖𝕣:* @${senderName}
⏰ *ℝ𝕖𝕔𝕠𝕧𝕖𝕣𝕖𝕕:* ${timestamp}
📂 *𝕋𝕪𝕡𝕖:* ${msgTypeDisplay}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 *𝔻𝔼𝕃𝔼𝕋𝔼𝔻 𝕄𝔼𝕊𝕊𝔸𝔾𝔼:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${text}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     💠 *ℙ𝕠𝕨𝕖𝕣𝕖𝕕 𝕓𝕪 𝕋𝔼ℝ𝕍𝕌𝕏 𝔹𝕠𝕥* 💠`;

            await sock.sendMessage(originalMsg.key.remoteJid, {
                text: output, mentions: [sender]
            });
        } catch (err) {
            console.error("Anti-Delete Error:", err.message);
        }
    }

    /**
     * Disconnect a session socket gracefully
     */
    async disconnectSession(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry?.sock) {
            if (entry.sock.onlineInterval) clearInterval(entry.sock.onlineInterval);
            try {
                entry.sock.end(undefined);
                if (entry.sock.ws) entry.sock.ws.close();
            } catch (e) {
                console.error(`Error closing socket for ${sessionId}:`, e.message);
            }
        }
        this.sessions.delete(sessionId);
    }

    /**
     * Destroy a session completely (disconnect + delete auth files)
     */
    async destroySession(sessionId) {
        await this.disconnectSession(sessionId);
        try {
            await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
            console.log(`🧹 [${sessionId}] Mongo Auth records deleted.`);
        } catch (e) {
            console.error(`[${sessionId}] Failed to delete auth records:`, e.message);
        }
    }

    /**
     * Pause a session (keeps connection alive for pause message replies)
     */
    async pauseSession(sessionId) {
        console.log(`⏸️ [${sessionId}] Session paused in DB. Socket remains alive to answer queries.`);
    }

    /**
     * Resume a paused session
     */
    async resumeSession(sessionId) {
        console.log(`▶️ [${sessionId}] Session resuming in DB...`);
        const dbSession = await WhatsAppSession.findById(sessionId);
        const hasAuth = await WhatsAppAuth.findOne({ sessionId, type: "creds" });
        if (dbSession && hasAuth && !this.isConnected(sessionId)) {
            await this.connectSession(sessionId);
        }
    }

    /**
     * Reconnect all active/paused sessions from DB (called on server startup)
     */
    async reconnectAll() {
        try {
            const now = new Date();
            const activeSessions = await WhatsAppSession.find({
                status: { $in: ["active", "paused", "disconnected"] },
                expiresAt: { $gt: now }
            });
            console.log(`🔄 [Reconnect] Current Time: ${now.toISOString()}`);
            console.log(`🔄 Found ${activeSessions.length} eligible session(s) to reconnect.`);

            for (const session of activeSessions) {
                // Skip reconnect for banned/deleted users
                const User = (await import("../models/User.js")).default;
                const user = await User.findById(session.userId);

                if (!user || user.isBanned) {
                    console.log(`⏭️ [${session._id}] Skipping — user banned or deleted.`);
                    session.status = "disconnected";
                    await session.save();
                    continue;
                }

                // Check if session deployment has expired
                if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
                    console.log(`⏭️ [${session._id}] Skipping — deployment expired.`);
                    session.status = "expired";
                    await session.save();
                    continue;
                }

                // Check auth directory exists
                const hasAuth = await WhatsAppAuth.findOne({ sessionId: session._id.toString(), type: "creds" });
                if (!hasAuth) {
                    console.log(`⏭️ [${session._id}] Skipping — no Mongo Auth creds found.`);
                    session.status = "disconnected";
                    await session.save();
                    continue;
                }

                console.log(`🔌 [${session._id}] Reconnecting session for ${session.phone}...`);
                try {
                    await this.connectSession(session._id.toString());
                } catch (err) {
                    console.error(`❌ [${session._id}] Reconnect failed:`, err.message);
                }

                // Stagger reconnections
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (error) {
            console.error("❌ Failed to reconnect sessions:", error);
        }
    }

    /**
     * Start pairing for a user
     */
    async startPairing(userId, phoneNumber, method, socketId, preserveAuth = false) {
        // Clean up any previous pairing sessions for this user ONLY IF not preserving auth
        if (!preserveAuth) {
            const oldPairingSessions = await WhatsAppSession.find({
                userId,
                status: "pairing"
            });
            for (const oldSession of oldPairingSessions) {
                console.log(`[Cleanup] Removing orphan pairing session ${oldSession._id} for user ${userId}`);
                try { await this.destroySession(oldSession._id.toString()); } catch (e) { }
                await WhatsAppAuth.deleteMany({ sessionId: oldSession._id.toString() });
                await WhatsAppSession.deleteOne({ _id: oldSession._id });
            }
        }

        // Create DB record if not preserving auth, otherwise try to reuse
        let dbSession;
        if (preserveAuth) {
            dbSession = await WhatsAppSession.findOne({ userId, status: "pairing" });
        }

        if (!dbSession) {
            dbSession = await WhatsAppSession.create({
                userId,
                phone: phoneNumber,
                status: "pairing",
                pairingStartedAt: new Date()
            });
        }

        const sessionId = dbSession._id.toString();

        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
        console.log(`[MongoAuth] Loading State keys: ${Object.keys(state.creds).length} config items.`);

        const waVersion = await getWaVersion();
        console.log(`[Pairing] Using WA Web version: ${waVersion.join('.')}`);

        const sock = makeWASocket({
            logger: pino({ level: "silent" }),
            auth: state,
            version: waVersion,
            browser: Browsers.ubuntu("Chrome"),
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 5000,
            maxMsgRetryCount: 5
        });
        let finished = false;
        let pairingTimeout = null;
        const finalizePairing = () => {
            if (finished) return;
            finished = true;
            if (pairingTimeout) {
                clearTimeout(pairingTimeout);
                pairingTimeout = null;
            }
            queueService.finishPairing(userId);
        };

        this.sessions.set(sessionId, {
            sock, reconnectAttempts: 0,
            configCache: null, configCacheTime: 0,
            messageCache: new Map()
        });

        // Request pairing code flow
        if (method === "code" && phoneNumber) {
            (async () => {
                try {
                    console.log(`[${sessionId}] 🛠️ Initializing Pairing Code flow for ${phoneNumber}...`);
                    const normalizedPhone = phoneNumber.replace(/\D/g, "");
                    let code = null;
                    let lastError = null;

                    // Retry code request window; on busy network, ws/open can take longer.
                    for (let attempt = 1; attempt <= 8; attempt++) {
                        if (sock.authState.creds.me || sock.authState.creds.registered) {
                            console.warn(`[${sessionId}] ⚠️ Socket already registered, skipping pairing code.`);
                            break;
                        }

                        try {
                            console.log(`[${sessionId}] 📡 Requesting pairing code (attempt ${attempt}/8)...`);
                            code = await sock.requestPairingCode(normalizedPhone);
                            if (code) break;
                        } catch (error) {
                            lastError = error;
                            console.warn(`[${sessionId}] Pairing code attempt ${attempt} failed: ${error.message}`);
                        }

                        await baileysDelay(3000);
                    }

                    if (!code) {
                        throw new Error(lastError?.message || "Failed to generate pairing code within retry window.");
                    }

                    console.log(`[${sessionId}] ✅ Pairing Code Received: ${code}`);
                    emitToUser(userId, "pairing_code", { code, sessionId });
                } catch (error) {
                    console.error(`[${sessionId}] ❌ Pairing code error:`, error.message);

                    // Only emit if not already handled by connection.update
                    const dbSess = await WhatsAppSession.findById(sessionId);
                    if (dbSess && dbSess.status === "pairing") {
                        emitToUser(userId, "pairing_error", {
                            error: `Failed to generate pairing code: ${error.message}`,
                            sessionId
                        });
                        finalizePairing();
                        try { sock.end(); } catch (e) { }
                        this.sessions.delete(sessionId);
                        // Clean up the failed pairing DB record
                        await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
                        await WhatsAppSession.deleteOne({ _id: sessionId });
                    }
                }
            })();
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log(`[${sessionId}] connection.update:`, connection || (qr ? "qr_received" : "other"));

            if (qr && method === "qr") {
                console.log(`[${sessionId}] 📱 QR code received, emitting to user ${userId}`);
                emitToUser(userId, "qr_update", { qr, sessionId });
            }

            if (connection === "open") {
                console.log(`✅ [${sessionId}] Pairing successful!`);
                await baileysDelay(2000);
                try {
                    await saveCreds();
                } catch (error) {
                    console.error(`[${sessionId}] Failed to persist pairing creds on open:`, error.message);
                }

                // Send Welcome Message to user's WhatsApp DM
                try {
                    const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    const welcomeMsg = `╔══════════════════════════════════╗
║ 🟢 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕃𝕆𝕌𝔻 𝔹𝕆𝕋 𝕃𝕀ℕ𝕂𝔼𝔻* 🟢 ║
╚══════════════════════════════════╝

Welcome! Your WhatsApp is now securely paired with Tervux Core.

To activate 24/7 cloud features like Auto-Reply and Anti-Delete, please return to your Dashboard and select a Subscription Protocol.

✨ *tervux.com/dashboard/billing*`;
                    await sock.sendMessage(userJid, { text: welcomeMsg });
                    console.log(`[${sessionId}] Welcome message sent to user DM.`);
                } catch (msgErr) {
                    console.error(`[${sessionId}] Failed to send DM:`, msgErr);
                }

                // Update DB
                const phone = sock.user?.id?.split(":")[0] || "";
                await WhatsAppSession.findByIdAndUpdate(sessionId, {
                    status: "active",
                    phone,
                    name: sock.user?.name || "Bot User",
                    lastConnected: new Date()
                });

                emitToUser(userId, "pairing_success", {
                    sessionId,
                    message: "Pairing Successful! Your bot is now active."
                });

                // Now disconnect the pairing socket and reconnect with full handler
                await baileysDelay(3000);
                try { sock.end(); } catch (e) { }
                finalizePairing();
                this.sessions.delete(sessionId);
                await this.connectSession(sessionId);
            }

            if (connection === "close") {
                const code = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || "";
                console.warn(`[${sessionId}] Pairing connection closed: ${code} — ${errorMessage}`);

                // 515 = stream error, Baileys auto-retries don't always work during pairing
                // We must recreate the socket but PRESERVE the auth state to resume
                if (code === 515) {
                    console.log(`[${sessionId}] 🔄 Retrying after stream error (515)...`);
                    emitToUser(userId, "queue_update", {
                        position: 0,
                        message: "Stream reset. Reconnecting...",
                        retrying: true
                    });

                    try { sock.end(); } catch (e) { }
                    this.sessions.delete(sessionId);

                    setTimeout(async () => {
                        try {
                            // Call startPairing again but preserve the auth state
                            await this.startPairing(userId, phoneNumber, method, socketId, true);
                        } catch (retryErr) {
                            console.error(`[${sessionId}] 515 Retry failed:`, retryErr.message);
                            finalizePairing();
                        }
                    }, 2000);
                    return;
                }


                // 405 = WhatsApp server rejection (rate limiting)
                // Don't auto-retry — each attempt deepens the rate limit

                // If still in pairing status, it was a failure
                const dbSess = await WhatsAppSession.findById(sessionId);
                if (dbSess && dbSess.status === "pairing") {
                    let errMsg = "Connection closed unexpectedly. Please try again.";
                    if (code === 408) errMsg = "Request timed out. WhatsApp servers didn't respond in time. Please try again.";
                    if (code === 401 || code === 405) errMsg = "WhatsApp rejected the connection. This usually happens when the servers are busy or your IP is temporarily blocked. Please wait a few minutes and try again.";
                    if (code === 428) errMsg = "Connection lost during pairing. Please try again.";
                    if (code === 440) errMsg = "Connection replaced by another pairing attempt. Only one attempt at a time.";
                    if (code === 411) errMsg = "WhatsApp requires a phone number update. Please use a different number.";

                    emitToUser(userId, "pairing_error", {
                        error: errMsg,
                        sessionId, statusCode: code
                    });

                    // Clean up failed pairing
                    await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
                    await WhatsAppSession.deleteOne({ _id: sessionId });
                }

                finalizePairing();
                try { sock.end(); } catch (e) { }
                this.sessions.delete(sessionId);
            }
        });

        // Timeout cleanup
        pairingTimeout = setTimeout(async () => {
            const dbSess = await WhatsAppSession.findById(sessionId);
            if (dbSess && dbSess.status === "pairing") {
                console.log(`[${sessionId}] Pairing timed out.`);
                emitToUser(userId, "pairing_error", {
                    error: "Pairing timed out. Please try again.",
                    sessionId
                });
                await this.destroySession(sessionId);
                await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
                await WhatsAppSession.deleteOne({ _id: sessionId });
            }
            finalizePairing();
        }, Number.isFinite(pairingTimeoutMs) ? Math.max(pairingTimeoutMs, 60_000) : 120_000);

        return { sessionId };
    }

    _emitToUser(userId, event, data) {
        try {
            emitToUser(userId, event, data);
        } catch (e) {
            console.error("Socket emit error:", e.message);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdownAll() {
        console.log(`🛑 Disconnecting ${this.sessions.size} session(s)...`);
        for (const [sessionId, entry] of this.sessions) {
            if (entry.sock?.onlineInterval) clearInterval(entry.sock.onlineInterval);
            try { entry.sock.end(); } catch (e) { }
        }
        this.sessions.clear();
    }
}

export default SessionManager;
