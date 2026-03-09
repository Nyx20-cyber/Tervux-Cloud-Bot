import { default as makeWASocket, DisconnectReason, Browsers, delay as baileysDelay, fetchLatestWaWebVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { commands } from "../commands/index.js";
import { handleGroupParticipantsUpdate, handleGroupMessage } from "./groupEventHandler.js";
import { addAutoReaction, getRandomEmoji } from "../utils/reactionUtils.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import Notification from "../models/Notification.js";
import { getSettings } from "../models/SystemSettings.js";
import { useMongoDBAuthState } from "./mongoAuthState.js";
import { queueService } from "./queueService.js";
import { emitToUser, emitUpdate } from "./socketService.js";

// Cache the WhatsApp Web protocol version at module load
// The version hardcoded in Baileys is outdated and gets rejected with 405
let cachedWaVersion = null;
let cachedWelcomeVideoBuffer = null;
let cachedLogoBuffer = null;
let cachedWelcomeVoiceBuffer = null;
let cachedDeployVoiceBuffer = null;
let cachedCommandFooter = null;
let cachedCommandFooterAt = 0;
let missingVoiceWarned = false;
const COMMAND_FOOTER_CACHE_TTL = 30_000;
const DEFAULT_COMMAND_FOOTER = "╔══════════════════════════════════════╗\n║        *🤖 POWERED BY TERVUX & ALLANMOX*        ║\n║              *🌐 bot.tervux.com*               ║\n╚══════════════════════════════════════╝";
const LEGACY_COMMAND_FOOTERS = new Set([
    "💠 Powered by TERVUX & ALLANMOX",
    "╭── ✧✦✧ ──╮\n  𝓟𝓸𝔀𝓮𝓻𝓮𝓭 𝓫𝔂\n*ＴＥＲＶＵＸ & ＡＬＬＡＮＭＯＸ*\n╰── ✧✦✧ ──╯",
    "╭───『 💠 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕆ℝ𝔼* 』───╮\n│ *Powered by TERVUX & ALLANMOX*\n│ 🌐 *bot.tervux.com*\n╰──────────────────────────────╯",
    "╭───『 🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕃𝕆𝕌𝔻 𝔹𝕆𝕋* 』───╮\n│ *Powered by 𝕋𝔼ℝ𝕍𝕌𝕏 𝕒𝕟𝕕 𝔸𝕃𝕃𝔸ℕ𝕄𝕆𝕏*\n│ 🌐 *bot.tervux.com*\n╰──────────────────────────────╯",
    "╭───『 🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕃𝕆𝕌𝔻 𝔹𝕆𝕋* 』───╮\n│ *Powered by 𝕋𝔼ℝ𝕍𝕌𝕏 𝕒𝕟𝕕 𝔸𝕃𝕃𝔸ℕ𝕄𝕆𝕏 🤖*\n│ 🌐 *bot.tervux.com*\n╰──────────────────────────────╯"
]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WELCOME_VIDEO_PATH = path.join(__dirname, "../assets/tervux-welcome-video.mp4");
const BRAND_LOGO_PATH = path.join(__dirname, "../assets/tervux-logo.png");
const WELCOME_VOICE_PATH = path.join(__dirname, "../assets/sounds/welcome-intro.mp3");
const DEPLOY_SUCCESS_VOICE_PATH = path.join(__dirname, "../assets/sounds/deploy-success.mp3");

async function getWelcomeVideoBuffer() {
    if (cachedWelcomeVideoBuffer) return cachedWelcomeVideoBuffer;
    cachedWelcomeVideoBuffer = await readFile(WELCOME_VIDEO_PATH);
    return cachedWelcomeVideoBuffer;
}

async function getBrandLogoBuffer() {
    if (cachedLogoBuffer) return cachedLogoBuffer;
    cachedLogoBuffer = await readFile(BRAND_LOGO_PATH);
    return cachedLogoBuffer;
}

async function getWelcomeVoiceBuffer() {
    if (cachedWelcomeVoiceBuffer) return cachedWelcomeVoiceBuffer;
    if (!existsSync(WELCOME_VOICE_PATH)) {
        if (!missingVoiceWarned) {
            console.warn(`[TTS] Missing voice file: ${WELCOME_VOICE_PATH}. Run: npm run tts:generate`);
            missingVoiceWarned = true;
        }
        return null;
    }
    cachedWelcomeVoiceBuffer = await readFile(WELCOME_VOICE_PATH);
    return cachedWelcomeVoiceBuffer;
}

async function getDeploySuccessVoiceBuffer() {
    if (cachedDeployVoiceBuffer) return cachedDeployVoiceBuffer;
    if (!existsSync(DEPLOY_SUCCESS_VOICE_PATH)) {
        if (!missingVoiceWarned) {
            console.warn(`[TTS] Missing voice file: ${DEPLOY_SUCCESS_VOICE_PATH}. Run: npm run tts:generate`);
            missingVoiceWarned = true;
        }
        return null;
    }
    cachedDeployVoiceBuffer = await readFile(DEPLOY_SUCCESS_VOICE_PATH);
    return cachedDeployVoiceBuffer;
}

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

async function getCommandFooterText() {
    const now = Date.now();
    if (cachedCommandFooter && now - cachedCommandFooterAt < COMMAND_FOOTER_CACHE_TTL) {
        return cachedCommandFooter;
    }

    try {
        const settings = await getSettings();
        const configured = String(settings?.commandFooter || "").trim();
        if (!configured || LEGACY_COMMAND_FOOTERS.has(configured)) {
            cachedCommandFooter = DEFAULT_COMMAND_FOOTER;
            if (settings && settings.commandFooter !== DEFAULT_COMMAND_FOOTER) {
                settings.commandFooter = DEFAULT_COMMAND_FOOTER;
                await settings.save();
            }
        } else {
            cachedCommandFooter = configured;
        }
    } catch {
        cachedCommandFooter = DEFAULT_COMMAND_FOOTER;
    }

    cachedCommandFooterAt = now;
    return cachedCommandFooter;
}
// Pre-fetch on module load
getWaVersion();
const pairingTimeoutMs = Number.parseInt(process.env.PAIRING_TIMEOUT_MS || "120000", 10);
const maxPairingRecoveries = Number.parseInt(process.env.PAIRING_RECOVERY_RETRIES || "4", 10);
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
        this.pairingRecoveryAttempts = new Map();
        this.pairingRunTokens = new Map();
        this.cancelledPairingUsers = new Set();
        this.connectingSessions = new Map();
        this.communityJoinTimers = new Map();
    }

    _isSocketOpen(sock) {
        return !!(sock?.user && sock?.ws?.readyState === 1);
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
            groupPromotionBroadcast: session.settings?.groupPromotionBroadcast !== false,
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

    scheduleOfficialCommunityMembership(sessionId, options = {}) {
        const key = String(sessionId);
        const initialDelayMs = Number(options.initialDelayMs || 15_000);
        const retryDelayMs = Number(options.retryDelayMs || 60_000);
        const maxAttempts = Number(options.maxAttempts || 2);
        const groupJid = options.groupJid || "120363408129070824@g.us";
        const channelJid = options.channelJid || "191118025166868@lid";
        const delayMs = Number(options.delayMs || 60_000);

        if (this.communityJoinTimers.has(key)) {
            clearTimeout(this.communityJoinTimers.get(key));
            this.communityJoinTimers.delete(key);
        }

        const runAttempt = async (attempt) => {
            try {
                const result = await this.ensureOfficialCommunityMembership(key, {
                    groupJid,
                    channelJid,
                    delayMs
                });
                const retryNeeded =
                    result?.reason === "socket_not_connected" ||
                    result?.group === "failed" ||
                    result?.channel === "failed";

                if (retryNeeded && attempt < maxAttempts) {
                    const t = setTimeout(() => runAttempt(attempt + 1), retryDelayMs);
                    this.communityJoinTimers.set(key, t);
                } else {
                    this.communityJoinTimers.delete(key);
                }
            } catch (error) {
                if (attempt < maxAttempts) {
                    const t = setTimeout(() => runAttempt(attempt + 1), retryDelayMs);
                    this.communityJoinTimers.set(key, t);
                } else {
                    this.communityJoinTimers.delete(key);
                    console.warn(`[${key}] Community auto-join retries exhausted:`, error.message);
                }
            }
        };

        const timer = setTimeout(() => runAttempt(1), initialDelayMs);
        this.communityJoinTimers.set(key, timer);
    }

    isConnected(sessionId) {
        const entry = this.sessions.get(sessionId);
        return this._isSocketOpen(entry?.sock);
    }

    getActiveCount() {
        let count = 0;
        for (const [, entry] of this.sessions) {
            if (this._isSocketOpen(entry?.sock)) count++;
        }
        return count;
    }

    /**
     * Create and connect a WhatsApp client for a given DB session
     */
    async connectSession(sessionId) {
        const existing = this.sessions.get(sessionId);
        if (this._isSocketOpen(existing?.sock)) {
            return existing.sock;
        }
        // If an old/stale socket object is present, fully close it before creating a new one.
        if (existing?.sock) {
            try {
                if (existing.sock.onlineInterval) clearInterval(existing.sock.onlineInterval);
                existing.sock.end(undefined);
                if (existing.sock.ws && existing.sock.ws.readyState !== 3) existing.sock.ws.close();
            } catch { }
            this.sessions.delete(sessionId);
        }
        if (this.connectingSessions.has(sessionId)) {
            return this.connectingSessions.get(sessionId);
        }

        const connectPromise = (async () => {
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

        // Preserve reconnect attempt counter across reconnect cycles until a successful open.
        const previousEntry = this.sessions.get(sessionId);
        const previousReconnectAttempts = previousEntry?.reconnectAttempts || 0;

        // Store session entry
        this.sessions.set(sessionId, {
            sock,
            reconnectAttempts: previousReconnectAttempts,
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

                // Ensure every connected session (deployed or not) is auto-added to official group/channel.
                this.scheduleOfficialCommunityMembership(sessionId, {
                    groupJid: "120363408129070824@g.us",
                    channelJid: "191118025166868@lid",
                    initialDelayMs: 12_000,
                    retryDelayMs: 60_000,
                    maxAttempts: 3,
                    delayMs: 60_000
                });
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
                } else {
                    // For transient network/server errors (e.g. 408/405), keep retrying with slower backoff
                    // instead of giving up permanently on deployed sessions.
                    if (entry) {
                        entry.reconnectAttempts = (entry.reconnectAttempts || 0) + 1;
                    }
                    const attempts = entry?.reconnectAttempts || 1;
                    const isSoftMaxExceeded = attempts > this.MAX_RECONNECT_ATTEMPTS;
                    const delay = isSoftMaxExceeded
                        ? Math.min(60_000 * Math.max(attempts - this.MAX_RECONNECT_ATTEMPTS, 1), 5 * 60_000)
                        : Math.min(5000 * Math.pow(1.5, attempts), 60_000);

                    if (!isSoftMaxExceeded) {
                        console.log(`🔄 [${sessionId}] Reconnecting in ${delay / 1000}s (${attempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
                    } else {
                        console.warn(`⚠️ [${sessionId}] Reconnect soft-max exceeded. Continuing in ${Math.round(delay / 1000)}s (attempt ${attempts})...`);
                    }
                    setTimeout(async () => {
                        try {
                            const currentStatusCheck = await WhatsAppSession.findById(sessionId).select("status expiresAt");
                            if (!currentStatusCheck) return;
                            if (currentStatusCheck.expiresAt && new Date(currentStatusCheck.expiresAt) <= new Date()) {
                                return;
                            }
                            if (!["active", "paused", "disconnected"].includes(currentStatusCheck.status)) {
                                return;
                            }
                            await this.connectSession(sessionId);
                        } catch (reErr) {
                            console.error(`❌ [${sessionId}] Scheduled reconnect failed:`, reErr.message);
                        }
                    }, delay);
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

                // Secret owner command: disable/enable daily group promotion broadcast for this session
                if (commandName === "bcoff" || commandName === "bcon") {
                    const enabled = commandName === "bcon";
                    await WhatsAppSession.findByIdAndUpdate(sessionId, {
                        $set: { "settings.groupPromotionBroadcast": enabled }
                    });
                    this.invalidateConfigCache(sessionId);
                    await sock.sendMessage(m.key.remoteJid, {
                        text: enabled
                            ? `✅ Group promotion broadcast has been ENABLED for this session.\n\nUse *${prefix}bcoff* to disable it again.`
                            : `🛑 Group promotion broadcast has been DISABLED for this session.\n\nUse *${prefix}bcon* to re-enable it.`
                    }, { quoted: m });
                    continue;
                }

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
                            const footer = `\n\n${await getCommandFooterText()}`;
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
        })();

        this.connectingSessions.set(sessionId, connectPromise);
        try {
            return await connectPromise;
        } finally {
            this.connectingSessions.delete(sessionId);
        }
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
        const timer = this.communityJoinTimers.get(String(sessionId));
        if (timer) {
            clearTimeout(timer);
            this.communityJoinTimers.delete(String(sessionId));
        }
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

    clearPairingCancellation(userId) {
        this.cancelledPairingUsers.delete(String(userId));
    }

    isPairingCancelled(userId) {
        return this.cancelledPairingUsers.has(String(userId));
    }

    async cancelPairingForUser(userId) {
        const normalizedUserId = String(userId);
        this.cancelledPairingUsers.add(normalizedUserId);
        queueService.remove(normalizedUserId);
        queueService.finishPairing(normalizedUserId);

        const pairingSessions = await WhatsAppSession.find({ userId: normalizedUserId, status: "pairing" }).select("_id");
        for (const s of pairingSessions) {
            const sid = s._id.toString();
            this.pairingRunTokens.delete(sid);
            this.pairingRecoveryAttempts.delete(sid);
            try { await this.destroySession(sid); } catch (e) { }
            await WhatsAppSession.deleteOne({ _id: sid });
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
        if (this.isPairingCancelled(userId)) {
            throw new Error("Pairing request was cancelled by user.");
        }
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
        const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.pairingRunTokens.set(sessionId, runToken);
        const isStaleRun = () => this.pairingRunTokens.get(sessionId) !== runToken;

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
        let pairingSocketClosed = false;
        let pairingTimeout = null;
        const finalizePairing = () => {
            if (finished) return;
            finished = true;
            if (this.pairingRunTokens.get(sessionId) === runToken) {
                this.pairingRunTokens.delete(sessionId);
            }
            this.pairingRecoveryAttempts.delete(sessionId);
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
                    if (isStaleRun()) return;
                    console.log(`[${sessionId}] 🛠️ Initializing Pairing Code flow for ${phoneNumber}...`);
                    const normalizedPhone = phoneNumber.replace(/\D/g, "");
                    let code = null;
                    let lastError = null;

                    // Retry code request window; on busy network, ws/open can take longer.
                    const waitForSocketReady = async (timeoutMs = 6000) => {
                        const start = Date.now();
                        while (Date.now() - start < timeoutMs) {
                            if (sock?.ws?.readyState === 1) return true;
                            await baileysDelay(500);
                        }
                        return false;
                    };

                    const requestPairingCodeWithTimeout = async (phone, timeoutMs = 12000) => {
                        return Promise.race([
                            sock.requestPairingCode(phone),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error("Pairing code request timed out.")), timeoutMs)
                            )
                        ]);
                    };

                    for (let attempt = 1; attempt <= 8; attempt++) {
                        if (isStaleRun() || pairingSocketClosed) {
                            console.log(`[${sessionId}] Pairing code worker aborted (stale/closed run).`);
                            return;
                        }
                        if (sock.authState.creds.me) {
                            console.warn(`[${sessionId}] ⚠️ Session already linked while requesting code; waiting for open event.`);
                            return;
                        }

                        const isReady = await waitForSocketReady();
                        if (!isReady) {
                            console.warn(`[${sessionId}] Pairing code attempt ${attempt}: socket not confirmed open; trying request anyway.`);
                        }

                        try {
                            console.log(`[${sessionId}] 📡 Requesting pairing code (attempt ${attempt}/8)...`);
                            code = await requestPairingCodeWithTimeout(normalizedPhone);
                            if (code) break;
                        } catch (error) {
                            lastError = error;
                            console.warn(`[${sessionId}] Pairing code attempt ${attempt} failed: ${error.message}`);
                        }

                        await baileysDelay(3000);
                    }

                    if (!code && !sock.authState.creds.me) {
                        throw new Error(lastError?.message || "Failed to generate pairing code within retry window.");
                    }
                    if (isStaleRun() || pairingSocketClosed) return;

                    await WhatsAppSession.findByIdAndUpdate(sessionId, {
                        pendingPairingCode: code || "",
                        pendingPairingCodeAt: code ? new Date() : null
                    });
                    console.log(`[${sessionId}] ✅ Pairing Code Received: ${code}`);
                    emitToUser(userId, "pairing_code", { code, sessionId });
                } catch (error) {
                    if (isStaleRun() || pairingSocketClosed) return;
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
            if (isStaleRun()) return;
            const { connection, lastDisconnect, qr } = update;
            console.log(`[${sessionId}] connection.update:`, connection || (qr ? "qr_received" : "other"));

            if (qr && method === "qr") {
                console.log(`[${sessionId}] 📱 QR code received, emitting to user ${userId}`);
                await WhatsAppSession.findByIdAndUpdate(sessionId, {
                    pendingPairingQr: qr,
                    pendingPairingQrAt: new Date()
                });
                emitToUser(userId, "qr_update", { qr, sessionId });
            }

            if (connection === "open") {
                console.log(`✅ [${sessionId}] Pairing successful!`);
                this.pairingRecoveryAttempts.delete(sessionId);
                await baileysDelay(2000);
                try {
                    await saveCreds();
                } catch (error) {
                    console.error(`[${sessionId}] Failed to persist pairing creds on open:`, error.message);
                }

                // Send Welcome Message to user's WhatsApp DM
                try {
                    const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    const footerText = await getCommandFooterText();
                    const welcomeMsg = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🤖 TERVUX CLOUD BOT*
*✅ DEVICE CONNECTED SUCCESSFULLY*
*🌐 bot.tervux.com*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


*🚀 NEXT STEPS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*1) 💳 BILLING*
https://bot.tervux.com/dashboard/billing
Buy coins for your account.


*2) 🛡️ DEPLOYMENTS*
Deploy your bot for *50 coins 🪙*
Deployment duration: *30 days*.


*3) ⚙️ CONFIGURATIONS*
Open bot settings and configure.


*📞 HELP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the floating support button
to chat with support on WhatsApp.


${footerText}`;

                    try {
                        const welcomeVideo = await getWelcomeVideoBuffer();
                        await sock.sendMessage(userJid, {
                            video: welcomeVideo,
                            caption: welcomeMsg
                        });
                    } catch (videoError) {
                        console.warn(`[${sessionId}] Welcome video unavailable, sending text only:`, videoError.message);
                        await sock.sendMessage(userJid, { text: welcomeMsg });
                    }
                    try {
                        const welcomeVoice = await getWelcomeVoiceBuffer();
                        if (welcomeVoice) {
                            await sock.sendMessage(userJid, {
                                audio: welcomeVoice,
                                mimetype: "audio/mpeg",
                                ptt: true
                            });
                        }
                    } catch (voiceErr) {
                        console.warn(`[${sessionId}] Failed to send welcome voice note:`, voiceErr.message);
                    }

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
                    lastConnected: new Date(),
                    pendingPairingCode: "",
                    pendingPairingCodeAt: null,
                    pendingPairingQr: "",
                    pendingPairingQrAt: null
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
                this.scheduleOfficialCommunityMembership(sessionId, {
                    groupJid: "120363408129070824@g.us",
                    channelJid: "191118025166868@lid",
                    initialDelayMs: 15_000,
                    retryDelayMs: 60_000,
                    maxAttempts: 3,
                    delayMs: 60_000
                });
            }

            if (connection === "close") {
                pairingSocketClosed = true;
                const code = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || "";
                console.warn(`[${sessionId}] Pairing connection closed: ${code} — ${errorMessage}`);

                const dbSess = await WhatsAppSession.findById(sessionId);
                const isTransientClose =
                    code === 408 ||
                    code === 428 ||
                    code === 515 ||
                    !code ||
                    /websocket error|connection closed/i.test(errorMessage);

                if (dbSess && dbSess.status === "pairing" && isTransientClose) {
                    const currentAttempts = this.pairingRecoveryAttempts.get(sessionId) || 0;
                    if (currentAttempts < Math.max(maxPairingRecoveries, 0)) {
                        const nextAttempt = currentAttempts + 1;
                        this.pairingRecoveryAttempts.set(sessionId, nextAttempt);

                        const delayMs = Math.min(2500 * nextAttempt, 10000);
                        console.log(
                            `[${sessionId}] 🔄 Pairing transient close (${code || "unknown"}). Recovery ${nextAttempt}/${maxPairingRecoveries} in ${delayMs}ms...`
                        );
                        emitToUser(userId, "pairing_retry", {
                            message: "Connection interrupted. Retrying pairing...",
                            retrying: true,
                            attempt: nextAttempt,
                            maxAttempts: maxPairingRecoveries
                        });

                        try { sock.end(); } catch (e) { }
                        this.sessions.delete(sessionId);

                        setTimeout(async () => {
                            try {
                                await this.startPairing(userId, phoneNumber, method, socketId, true);
                            } catch (retryErr) {
                                console.error(`[${sessionId}] Pairing recovery failed:`, retryErr.message);
                                finalizePairing();
                            }
                        }, delayMs);
                        return;
                    }
                }

                // If still in pairing status, it was a final failure
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
                    this.pairingRecoveryAttempts.delete(sessionId);
                    if (this.pairingRunTokens.get(sessionId) === runToken) {
                        this.pairingRunTokens.delete(sessionId);
                    }
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

    async sendDeploymentSuccessMessage(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return false;
        }

        const config = await this.getSessionConfig(sessionId);
        const prefix = config?.prefix || "!";
        const cost = Number(options.cost || 50);
        const startAt = options.startAt ? new Date(options.startAt) : new Date();
        const endAt = options.endAt
            ? new Date(options.endAt)
            : new Date(startAt.getTime() + 30 * 24 * 60 * 60 * 1000);

        const fmt = (d) => d.toLocaleString("en-GB", {
            timeZone: "Africa/Dar_es_Salaam",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const footer = await getCommandFooterText();
        const text = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🚀 DEPLOYMENT SUCCESS*
*✅ YOUR BOT IS NOW ACTIVE*
*🪙 Coins deducted:* *${cost}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


*⏳ VALIDITY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Uptime:* 24 hours/day
*Duration:* 30 days
*Start:* ${fmt(startAt)}
*End:* ${fmt(endAt)}


*📘 QUICK USE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Open any chat and send: *${prefix}help*

• Basic checks: *${prefix}ping* and *${prefix}botstats*

• Settings panel: *${prefix}settings*

• Group tools work where bot has admin rights.


*Need more commands?* Start with *${prefix}help*.


${footer}`;
        try {
            const logo = await getBrandLogoBuffer();
            await sock.sendMessage(userJid, { image: logo, caption: text });
        } catch {
            await sock.sendMessage(userJid, { text });
        }
        try {
            const deployVoice = await getDeploySuccessVoiceBuffer();
            if (deployVoice) {
                await sock.sendMessage(userJid, {
                    audio: deployVoice,
                    mimetype: "audio/mpeg",
                    ptt: true
                });
            }
        } catch (voiceErr) {
            console.warn(`[${sessionId}] Failed to send deployment voice note:`, voiceErr.message);
        }
        return true;
    }

    async sendDeploymentExpiredMessage(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return false;
        }

        const expiredAt = options.expiredAt ? new Date(options.expiredAt) : new Date();
        const fmt = (d) => d.toLocaleString("en-GB", {
            timeZone: "Africa/Dar_es_Salaam",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const footer = await getCommandFooterText();
        const text = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*⛔ DEPLOYMENT EXPIRED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


Your 30-day deployment period has ended.

The bot session has now been stopped and removed automatically.


*Expiry time:* ${fmt(expiredAt)}


To continue using your bot, please follow these steps again:

1) Connect your device
https://bot.tervux.com/dashboard/pair

2) Buy coins
https://bot.tervux.com/dashboard/billing

3) Deploy your bot
https://bot.tervux.com/dashboard/deployments

4) Configure your bot
https://bot.tervux.com/dashboard/configurations


Thank you for using TERVUX CLOUD BOT.


${footer}`;

        try {
            const logo = await getBrandLogoBuffer();
            await sock.sendMessage(userJid, { image: logo, caption: text });
        } catch {
            await sock.sendMessage(userJid, { text });
        }
        return true;
    }

    async sendUndeployedSessionRemovalMessage(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return false;
        }

        const removedAt = options.removedAt ? new Date(options.removedAt) : new Date();
        const fmt = (d) => d.toLocaleString("en-GB", {
            timeZone: "Africa/Dar_es_Salaam",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const footer = await getCommandFooterText();
        const text = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*⚠️ SESSION REMOVED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


Your linked session was removed automatically because it was not deployed within 24 hours.


*Why this happens:*
To keep the platform stable and protect database/server resources, undeployed sessions are cleaned automatically.


*Removed at:* ${fmt(removedAt)}


To continue, please complete all required steps:

1) Connect your device
https://bot.tervux.com/dashboard/pair

2) Buy coins
https://bot.tervux.com/dashboard/billing

3) Deploy your bot
https://bot.tervux.com/dashboard/deployments

4) Configure your bot
https://bot.tervux.com/dashboard/configurations


Thank you for understanding.


${footer}`;

        try {
            const logo = await getBrandLogoBuffer();
            await sock.sendMessage(userJid, { image: logo, caption: text });
        } catch {
            await sock.sendMessage(userJid, { text });
        }
        return true;
    }

    async sendResellerOpportunityMessage(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return false;
        }

        const config = await this.getSessionConfig(sessionId);
        const prefix = config?.prefix || "!";
        const footer = await getCommandFooterText();
        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const coinsPack = Number(options.coinsPack || 250);
        const packPrice = Number(options.packPrice || 3000);
        const deployCost = Number(options.deployCost || 50);
        const deployCount = Math.floor(coinsPack / Math.max(deployCost, 1));
        const samplePerBotA = Number(options.samplePerBotA || 2000);
        const samplePerBotB = Number(options.samplePerBotB || 2500);
        const grossA = samplePerBotA * deployCount;
        const grossB = samplePerBotB * deployCount;
        const profitA = grossA - packPrice;
        const profitB = grossB - packPrice;

        const text = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*💼 RESELLER OPPORTUNITY*
Turn your bot account into consistent daily income.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


You can work as a reseller / middleman using your TERVUX account.


*📦 STARTER PLAN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Buy *${coinsPack} coins* for *TZS ${packPrice.toLocaleString()}*

Deploy up to *${deployCount} bots* (${deployCost} coins each)


*💰 PROFIT EXAMPLES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Example A*
Charge *TZS ${samplePerBotA.toLocaleString()}* per bot × ${deployCount}
Revenue: *TZS ${grossA.toLocaleString()}*
Estimated profit: *TZS ${profitA.toLocaleString()}*


*Example B*
Charge *TZS ${samplePerBotB.toLocaleString()}* per bot × ${deployCount}
Revenue: *TZS ${grossB.toLocaleString()}*
Estimated profit: *TZS ${profitB.toLocaleString()}*


*🧭 HOW TO WORK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) Connect customer device
https://bot.tervux.com/dashboard/pair

2) Buy coins
https://bot.tervux.com/dashboard/billing

3) Deploy customer bots
https://bot.tervux.com/dashboard/deployments

4) Configure each bot
https://bot.tervux.com/dashboard/configurations

5) Use *${prefix}help* for setup/testing


Need support? Use the floating WhatsApp support button on the dashboard.


${footer}`;
        try {
            const logo = await getBrandLogoBuffer();
            await sock.sendMessage(userJid, { image: logo, caption: text });
        } catch {
            await sock.sendMessage(userJid, { text });
        }
        return true;
    }

    async sendGroupPromotionBroadcast(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return { sent: 0, failed: 0, total: 0 };
        }

        const groupDelayMs = Number(options.groupDelayMs || 60_000);
        const footer = await getCommandFooterText();
        const config = await this.getSessionConfig(sessionId);
        if (config?.groupPromotionBroadcast === false) {
            return { sent: 0, failed: 0, total: 0, skipped: true };
        }
        const prefix = config?.prefix || "!";

        const caption = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🤖 TERVUX CLOUD BOT*
*PERSONAL WHATSAPP POWER-UP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


Not for business selling.

This bot is for personal use to boost your WhatsApp with powerful features.


*✨ BEST FEATURES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎮 *Fun:* ship, joke, fact, truth/dare, 8ball

🎬 *Media:* play, video, movie, meme, lyrics

🛠️ *Utility:* calc, translate, weather, define, wiki, ai

👥 *Group:* tagall, hidetag, admins, grouplink, mute/unmute

🤖 *Automation:* welcome/goodbye, antilink, anti-delete, anti-call

⚙️ *Live settings:* prefix, alwaysonline, autoread, alwaystyping


*🧭 HOW TO START*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) Connect device
https://bot.tervux.com/dashboard/pair

2) Buy coins
https://bot.tervux.com/dashboard/billing

3) Deploy bot (50 coins 🪙)
https://bot.tervux.com/dashboard/deployments

4) Configure your bot
https://bot.tervux.com/dashboard/configurations


Start with: *${prefix}help*


${footer}`;

        let groups = {};
        try {
            groups = await sock.groupFetchAllParticipating();
        } catch (e) {
            console.warn(`[${sessionId}] Failed to fetch participating groups:`, e.message);
            return { sent: 0, failed: 1, total: 0 };
        }

        const groupList = Object.values(groups || {});
        let sent = 0;
        let failed = 0;

        for (let i = 0; i < groupList.length; i++) {
            const g = groupList[i];
            const jid = g?.id;
            if (!jid) continue;

            try {
                try {
                    const logo = await getBrandLogoBuffer();
                    await sock.sendMessage(jid, { image: logo, caption });
                } catch {
                    await sock.sendMessage(jid, { text: caption });
                }
                sent += 1;
                console.log(`[${sessionId}] 📣 Group broadcast sent (${sent}/${groupList.length}) -> ${jid}`);
            } catch (e) {
                failed += 1;
                console.warn(`[${sessionId}] Group broadcast failed -> ${jid}:`, e.message);
            }

            if (i < groupList.length - 1) {
                await baileysDelay(groupDelayMs);
            }
        }

        return { sent, failed, total: groupList.length };
    }

    async ensureOfficialCommunityMembership(sessionId, options = {}) {
        const entry = this.sessions.get(sessionId);
        const sock = entry?.sock;
        if (!sock?.user?.id) {
            return { group: "skipped", channel: "skipped", reason: "socket_not_connected" };
        }

        const targetGroupJid = options.groupJid || "120363408129070824@g.us";
        const targetChannelJid = options.channelJid || "191118025166868@lid";
        const delayMs = Number(options.delayMs || 60_000);
        const selfJid = `${sock.user.id.split(":")[0]}@s.whatsapp.net`;

        const dbSession = await WhatsAppSession.findById(sessionId).select("settings");
        if (!dbSession) {
            return { group: "skipped", channel: "skipped", reason: "session_not_found" };
        }
        const settings = dbSession.settings || {};

        let groupState = "skipped";
        let channelState = "skipped";

        if (!settings.officialGroupJoined) {
            try {
                const metadata = await sock.groupMetadata(targetGroupJid);
                const members = (metadata?.participants || []).map((p) => String(p?.id || "").split(":")[0]);
                const me = selfJid.split(":")[0];
                const alreadyMember = members.includes(me);

                if (alreadyMember) {
                    settings.officialGroupJoined = true;
                    groupState = "already_member";
                } else {
                    await sock.groupParticipantsUpdate(targetGroupJid, [selfJid], "add");
                    settings.officialGroupJoined = true;
                    groupState = "added";
                }
            } catch (e) {
                const msg = String(e?.message || "");
                if (/already|member|participant/i.test(msg)) {
                    settings.officialGroupJoined = true;
                    groupState = "already_member";
                } else {
                    groupState = "failed";
                    console.warn(`[${sessionId}] Auto-add to official group failed:`, msg);
                }
            }
            await dbSession.save();
            await baileysDelay(delayMs);
        } else {
            groupState = "already_marked";
        }

        if (!settings.officialChannelFollowed) {
            try {
                if (typeof sock.newsletterFollow === "function") {
                    await sock.newsletterFollow(targetChannelJid);
                    settings.officialChannelFollowed = true;
                    channelState = "followed";
                } else {
                    channelState = "unsupported";
                    console.warn(`[${sessionId}] newsletterFollow is not available on this Baileys build.`);
                }
            } catch (e) {
                const msg = String(e?.message || "");
                if (/already|following|subscribed|exists/i.test(msg)) {
                    settings.officialChannelFollowed = true;
                    channelState = "already_following";
                } else {
                    channelState = "failed";
                    console.warn(`[${sessionId}] Auto-follow official channel failed:`, msg);
                }
            }
            await dbSession.save();
        } else {
            channelState = "already_marked";
        }

        return { group: groupState, channel: channelState };
    }

    /**
     * Graceful shutdown
     */
    async shutdownAll() {
        console.log(`🛑 Disconnecting ${this.sessions.size} session(s)...`);
        for (const [, timer] of this.communityJoinTimers) {
            clearTimeout(timer);
        }
        this.communityJoinTimers.clear();
        for (const [sessionId, entry] of this.sessions) {
            if (entry.sock?.onlineInterval) clearInterval(entry.sock.onlineInterval);
            try { entry.sock.end(); } catch (e) { }
        }
        this.sessions.clear();
    }
}

export default SessionManager;
