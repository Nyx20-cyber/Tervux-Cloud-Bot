import { default as makeWASocket, DisconnectReason, Browsers, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { commands } from "../commands/index.js";
import { handleGroupParticipantsUpdate, handleGroupMessage } from "./groupEventHandler.js";
import { addAutoReaction, getRandomEmoji } from "../utils/reactionUtils.js";
import WhatsAppSession from "../models/WhatsAppSession.js";

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
            antiViewOnce: session.settings?.antiViewOnce || false,
            antiRemove: session.settings?.antiRemove || false,
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

        const authDir = dbSession.authDir;
        if (!existsSync(authDir)) {
            mkdirSync(authDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        console.log(`🔌 [${sessionId}] Creating WhatsApp socket...`);

        const sock = makeWASocket({
            logger: pino({ level: "silent" }),
            auth: state,
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

                // Update DB
                const phone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0];
                await WhatsAppSession.findByIdAndUpdate(sessionId, {
                    status: "active",
                    phone: phone || dbSession.phone,
                    name: sock.user?.name || "Bot User",
                    lastConnected: new Date()
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

                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const isConflict = errorMessage.includes("conflict") ||
                    statusCode === DisconnectReason.connectionReplaced;

                console.log(`❌ [${sessionId}] Connection closed. Code: ${statusCode}`);

                if (isLoggedOut) {
                    console.log(`🔓 [${sessionId}] Logged out.`);
                    await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
                    this.sessions.delete(sessionId);
                } else if (isConflict) {
                    console.log(`⚠️ [${sessionId}] Session conflict.`);
                    await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
                    this.sessions.delete(sessionId);
                } else if (entry && entry.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
                    entry.reconnectAttempts++;
                    const delay = Math.min(5000 * Math.pow(1.5, entry.reconnectAttempts), 60000);
                    console.log(`🔄 [${sessionId}] Reconnecting in ${delay / 1000}s (${entry.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(() => this.connectSession(sessionId), delay);
                } else {
                    console.log(`❌ [${sessionId}] Max reconnection attempts reached.`);
                    await WhatsAppSession.findByIdAndUpdate(sessionId, { status: "disconnected" });
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
                            const groupSettings = loadGroupSettings(chatJid);
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

✨ Get your own bot at tervux.com

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
            try { entry.sock.end(); } catch (e) { }
        }
        this.sessions.delete(sessionId);
    }

    /**
     * Destroy a session completely (disconnect + delete auth files)
     */
    async destroySession(sessionId, authDir) {
        await this.disconnectSession(sessionId);
        if (authDir && existsSync(authDir)) {
            try {
                rmSync(authDir, { recursive: true, force: true });
                console.log(`🧹 [${sessionId}] Auth files deleted.`);
            } catch (e) {
                console.error(`[${sessionId}] Failed to delete auth files:`, e.message);
            }
        }
    }

    /**
     * Pause a session (disconnects but keeps auth)
     */
    async pauseSession(sessionId) {
        await this.disconnectSession(sessionId);
        console.log(`⏸️ [${sessionId}] Session paused.`);
    }

    /**
     * Resume a paused session (reconnects)
     */
    async resumeSession(sessionId) {
        console.log(`▶️ [${sessionId}] Session resuming...`);
        const dbSession = await WhatsAppSession.findById(sessionId);
        if (dbSession && existsSync(dbSession.authDir) && existsSync(join(dbSession.authDir, "creds.json"))) {
            await this.connectSession(sessionId);
        }
    }

    /**
     * Reconnect all active sessions from DB (called on server startup)
     */
    async reconnectAll() {
        try {
            const activeSessions = await WhatsAppSession.find({
                status: "active"
            });

            console.log(`🔄 Found ${activeSessions.length} active session(s) to reconnect.`);

            for (const session of activeSessions) {
                // Check if user's subscription is still active
                const User = (await import("../models/User.js")).default;
                const user = await User.findById(session.userId);

                if (!user || user.isBanned) {
                    console.log(`⏭️ [${session._id}] Skipping — user banned or deleted.`);
                    session.status = "disconnected";
                    await session.save();
                    continue;
                }

                if (session.subscription?.status !== "active" ||
                    (session.subscription?.expiresAt && new Date(session.subscription.expiresAt) < new Date())) {
                    console.log(`⏭️ [${session._id}] Skipping — subscription expired.`);
                    session.status = "expired";
                    await session.save();
                    continue;
                }

                // Check auth directory exists
                if (!existsSync(session.authDir) || !existsSync(join(session.authDir, "creds.json"))) {
                    console.log(`⏭️ [${session._id}] Skipping — no auth files found.`);
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
    async startPairing(userId, phoneNumber, method, socketId) {
        const { default: makeWASocket2, useMultiFileAuthState: useAuth2, Browsers: B2 } = await import("@whiskeysockets/baileys");
        const { delay } = await import("@whiskeysockets/baileys");
        const { emitUpdate, getIO } = await import("./socketService.js");

        const authDir = join(process.cwd(), "auth_sessions", userId + "_" + Date.now());
        if (!existsSync(authDir)) {
            mkdirSync(authDir, { recursive: true });
        }

        // Create DB record
        const dbSession = await WhatsAppSession.create({
            userId,
            phone: phoneNumber,
            authDir,
            status: "pairing",
            pairingStartedAt: new Date()
        });

        const sessionId = dbSession._id.toString();

        const { state, saveCreds } = await useAuth2(authDir);

        const sock = makeWASocket2({
            logger: pino({ level: "silent" }),
            auth: state,
            browser: B2.ubuntu("Chrome"),
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        this.sessions.set(sessionId, {
            sock, reconnectAttempts: 0,
            configCache: null, configCacheTime: 0,
            messageCache: new Map()
        });

        // Request pairing code
        if (method === "code" && phoneNumber) {
            (async () => {
                try {
                    let attempts = 0;
                    const maxAttempts = 5;
                    while (attempts < maxAttempts) {
                        attempts++;
                        const waitTime = attempts === 1 ? 6000 : 3000;
                        await delay(waitTime);
                        if (!sock.authState.creds.me && !sock.authState.creds.registered) {
                            console.log(`[${sessionId}] Requesting pairing code (attempt ${attempts})...`);
                            const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ""));
                            console.log(`[${sessionId}] ✅ Pairing Code: ${code}`);
                            this._emitToSocket(socketId, "pairing_code", { code, sessionId });
                            break;
                        } else {
                            break;
                        }
                    }
                } catch (error) {
                    console.error(`[${sessionId}] ❌ Pairing code failed:`, error.message);
                    this._emitToSocket(socketId, "pairing_error", {
                        error: "Failed to generate pairing code. Please try again.",
                        sessionId
                    });
                }
            })();
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && method === "qr") {
                this._emitToSocket(socketId, "qr_update", { qr, sessionId });
            }

            if (connection === "open") {
                console.log(`✅ [${sessionId}] Pairing successful!`);
                await delay(2000);

                // Build session ID for user
                let sessionData = "";
                try {
                    const credsPath = join(authDir, "creds.json");
                    const creds = JSON.parse(readFileSync(credsPath).toString());
                    sessionData = "Tervux-" + Buffer.from(JSON.stringify({ creds })).toString("base64");
                } catch (e) {
                    console.error(`[${sessionId}] Failed to read creds:`, e);
                }

                // Send session ID to user's WhatsApp DM
                try {
                    const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    await sock.sendMessage(userJid, { text: sessionData });
                    console.log(`[${sessionId}] Session ID sent to user DM.`);
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

                this._emitToSocket(socketId, "pairing_success", {
                    sessionId,
                    message: "Pairing Successful! Your bot is now active."
                });

                // Now disconnect the pairing socket and reconnect with full handler
                await delay(3000);
                sock.end();
                this.sessions.delete(sessionId);
                await this.connectSession(sessionId);
            }

            if (connection === "close") {
                const code = lastDisconnect?.error?.output?.statusCode;
                console.warn(`[${sessionId}] Pairing connection closed: ${code}`);

                if (code === 515) {
                    console.log(`[${sessionId}] 🔄 Retrying after stream error...`);
                    return;
                }

                // If still in pairing status, it was a failure
                const dbSess = await WhatsAppSession.findById(sessionId);
                if (dbSess && dbSess.status === "pairing") {
                    this._emitToSocket(socketId, "pairing_error", {
                        error: "Connection closed. Please try again.",
                        sessionId, statusCode: code
                    });
                    // Don't delete yet — ghost cleanup will handle it
                }
                this.sessions.delete(sessionId);
            }
        });

        // Timeout cleanup
        setTimeout(async () => {
            const dbSess = await WhatsAppSession.findById(sessionId);
            if (dbSess && dbSess.status === "pairing") {
                console.log(`[${sessionId}] Pairing timed out.`);
                await this.destroySession(sessionId, authDir);
                await WhatsAppSession.deleteOne({ _id: sessionId });
            }
        }, 120 * 1000);

        return { sessionId };
    }

    _emitToSocket(socketId, event, data) {
        import("./socketService.js").then(({ getIO }) => {
            try {
                const io = getIO();
                io.emit(event, data);
                console.log(`📡 EMIT: ${event}`);
            } catch (e) {
                console.error("Socket emit error:", e.message);
            }
        }).catch(e => {
            console.error("Socket import error:", e.message);
        });
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
