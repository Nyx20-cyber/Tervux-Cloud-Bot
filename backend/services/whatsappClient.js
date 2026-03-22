import { default as makeWASocket, DisconnectReason, Browsers, delay as baileysDelay, fetchLatestWaWebVersion, jidNormalizedUser, areJidsSameUser } from "@whiskeysockets/baileys";
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
import { loadGroupSettings, cleanupSessionGroupSettingsCaches } from "./groupSettingsService.js";
import { getGroupParticipantContext, invalidateGroupMetadataCache } from "../utils/groupUtils.js";
import {
    DEFAULT_SETTINGS,
    getCachedConfig as getPersistentCachedConfig,
    getCachedRuntimeSnapshot,
    invalidateSessionCaches as invalidatePersistentSessionCaches,
    mergeCachedRuntimeSnapshot,
    primeSessionCachesFromDocument
} from "./configService.js";

// Cache the WhatsApp Web protocol version at module load
// The version hardcoded in Baileys is outdated and gets rejected with 405
let cachedWaVersion = null;
let cachedWaVersionAt = 0;
const WA_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // Refresh every 6 hours
let cachedWelcomeVideoBuffer = null;
let cachedLogoBuffer = null;
let cachedWelcomeVoiceBuffer = null;
let cachedDeployVoiceBuffer = null;
let cachedCommandFooter = null;
let cachedCommandFooterAt = 0;
let missingVoiceWarned = false;
const COMMAND_FOOTER_CACHE_TTL = 30_000;
const DEFAULT_COMMAND_FOOTER = "╔══════════════════════════════════════╗\n║        *🤖 POWERED BY TERVUX & ALLANMOX*        ║\n║              *🌐 bot.tervux.com*               ║\n╚══════════════════════════════════════╝";
const OFFICIAL_GROUP_INVITE_LINK = process.env.OFFICIAL_GROUP_INVITE_LINK || "https://chat.whatsapp.com/CAmxN3oOVxwGmoyYO0NfQv";
const OFFICIAL_CHANNEL_LINK = process.env.OFFICIAL_CHANNEL_LINK || "https://whatsapp.com/channel/0029Vb6z2Hp7YSczTRHtmr0N";
const OFFICIAL_CHANNEL_JID = process.env.OFFICIAL_CHANNEL_JID || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRACE_GROUP_PATH = process.env.WA_TRACE_GROUP_PATH === "true";
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

function noisyFeatureWarn(...args) {
    if (!IS_PRODUCTION) {
        console.warn(...args);
    }
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
    const now = Date.now();
    if (cachedWaVersion && (now - cachedWaVersionAt < WA_VERSION_CACHE_TTL_MS)) return cachedWaVersion;
    try {
        const { version } = await fetchLatestWaWebVersion({});
        cachedWaVersion = version;
        cachedWaVersionAt = now;
        console.log(`[WA Version] Fetched: ${version.join('.')}`);
    } catch (e) {
        // If we have a previous version, keep using it
        if (cachedWaVersion) {
            console.warn(`[WA Version] Refresh failed, keeping current: ${cachedWaVersion.join('.')}`);
            return cachedWaVersion;
        }
        console.warn(`[WA Version] Fetch failed, using fallback`);
        cachedWaVersion = [2, 3000, 1034408607]; // Known working version
        cachedWaVersionAt = now;
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

function extractWhatsAppInviteCode(link = "") {
    const value = String(link || "").trim();
    if (!value) return "";
    const match = value.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
    if (match?.[1]) return match[1];
    if (/^[A-Za-z0-9]{10,30}$/.test(value)) return value;
    return "";
}

function extractWhatsAppChannelInviteCode(link = "") {
    const value = String(link || "").trim();
    if (!value) return "";
    const match = value.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
    if (match?.[1]) return match[1];
    return "";
}

function unwrapCommandMessageContent(message = {}) {
    let content = message;
    for (let i = 0; i < 8; i++) {
        if (content?.ephemeralMessage?.message) {
            content = content.ephemeralMessage.message;
            continue;
        }
        if (content?.viewOnceMessage?.message) {
            content = content.viewOnceMessage.message;
            continue;
        }
        if (content?.viewOnceMessageV2?.message) {
            content = content.viewOnceMessageV2.message;
            continue;
        }
        if (content?.viewOnceMessageV2Extension?.message) {
            content = content.viewOnceMessageV2Extension.message;
            continue;
        }
        break;
    }
    return content || {};
}

function extractIncomingCommandText(message = {}) {
    const content = unwrapCommandMessageContent(message);
    return (
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption ||
        ""
    );
}

function isOwnerCommandMessage(sock, message, config) {
    const senderRaw = message?.key?.participant || message?.participant || message?.key?.remoteJid || "";
    const senderJid = senderRaw ? jidNormalizedUser(senderRaw) : "";
    const botRaw = sock?.user?.id || "";
    const botJid = botRaw ? jidNormalizedUser(botRaw) : "";
    const ownerJid = config?.ownerJid ? jidNormalizedUser(config.ownerJid) : "";
    const ownerNumber = String(config?.ownerNumber || "").replace(/\D/g, "");
    const senderNumber = senderJid ? senderJid.split("@")[0].split(":")[0] : "";
    const botNumber = botJid ? botJid.split("@")[0].split(":")[0] : "";

    return Boolean(
        message?.key?.fromMe ||
        (senderJid && botJid && areJidsSameUser(senderJid, botJid)) ||
        (ownerJid && senderJid && areJidsSameUser(senderJid, ownerJid)) ||
        (ownerNumber && senderNumber === ownerNumber) ||
        (botNumber && senderNumber === botNumber)
    );
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
        this.CONFIG_CACHE_TTL = Number.parseInt(process.env.WA_CONFIG_CACHE_TTL_MS || "30000", 10);
        this.RUNTIME_META_CACHE_TTL = Number.parseInt(process.env.WA_RUNTIME_META_CACHE_TTL_MS || "30000", 10);
        this.STATUS_AUTOMATION_MIN_INTERVAL_MS = Number.parseInt(process.env.WA_STATUS_AUTOMATION_MIN_INTERVAL_MS || "15000", 10);
        this.DELAYED_COMMAND_HEAL_THRESHOLD_MS = Number.parseInt(process.env.WA_DELAYED_COMMAND_HEAL_THRESHOLD_MS || "20000", 10);
        this.DELAYED_COMMAND_HEAL_COOLDOWN_MS = Number.parseInt(process.env.WA_DELAYED_COMMAND_HEAL_COOLDOWN_MS || "180000", 10);
        this.RUNTIME_HEALTH_INTERVAL_MS = Number.parseInt(process.env.WA_RUNTIME_HEALTH_INTERVAL_MS || "60000", 10);
        this.RUNTIME_STALE_MS = Number.parseInt(process.env.WA_RUNTIME_STALE_MS || "180000", 10);
        this.SOCKET_CONNECT_GRACE_MS = Number.parseInt(process.env.WA_SOCKET_CONNECT_GRACE_MS || "45000", 10);
        this.RECONNECT_CONCURRENCY_LIMIT = Number.parseInt(process.env.WA_RECONNECT_CONCURRENCY_LIMIT || "6", 10);
        this.LOW_PRIORITY_BACKLOG_LIMIT = Number.parseInt(process.env.WA_LOW_PRIORITY_BACKLOG_LIMIT || "25", 10);
        this.LOW_PRIORITY_DEFER_MS = Number.parseInt(process.env.WA_LOW_PRIORITY_DEFER_MS || "150", 10);
        this.HEALTH_SKIP_AFTER_COMMAND_MS = Number.parseInt(process.env.WA_HEALTH_SKIP_AFTER_COMMAND_MS || "60000", 10);
        this.SLOW_COMMAND_WARN_MS = Number.parseInt(process.env.WA_SLOW_COMMAND_WARN_MS || "1500", 10);
        this.AMBIENT_QUEUE_WARN_DEPTH = Number.parseInt(process.env.WA_AMBIENT_QUEUE_WARN_DEPTH || "8", 10);
        this.GLOBAL_LOW_PRIORITY_CONCURRENCY_LIMIT = Number.parseInt(process.env.WA_GLOBAL_LOW_PRIORITY_CONCURRENCY_LIMIT || "12", 10);
        this.GLOBAL_LOW_PRIORITY_QUEUE_LIMIT = Number.parseInt(process.env.WA_GLOBAL_LOW_PRIORITY_QUEUE_LIMIT || "180", 10);
        this.LOAD_SHED_SESSION_THRESHOLD = Number.parseInt(process.env.WA_LOAD_SHED_SESSION_THRESHOLD || "450", 10);
        this.LOAD_SHED_LOW_PRIORITY_DEPTH = Number.parseInt(process.env.WA_LOAD_SHED_LOW_PRIORITY_DEPTH || "90", 10);
        this.HEARTBEAT_INTERVAL_MS = Number.parseInt(process.env.WA_HEARTBEAT_INTERVAL_MS || "60000", 10);
        this.HEARTBEAT_JITTER_MS = Number.parseInt(process.env.WA_HEARTBEAT_JITTER_MS || "15000", 10);
        this.LOGGED_OUT_CONFIRM_WINDOW_MS = Number.parseInt(process.env.WA_LOGGED_OUT_CONFIRM_WINDOW_MS || "180000", 10);
        this.pairingRecoveryAttempts = new Map();
        this.pairingRunTokens = new Map();
        this.cancelledPairingUsers = new Set();
        this.connectingSessions = new Map();
        this.communityJoinTimers = new Map();
        this.reconnectTimers = new Map();
        this.reconnectAttempts = new Map();
        this.conflictRecoveryState = new Map();
        this.cryptoRepairCooldowns = new Map();
        this.cryptoRepairInFlight = new Set();
        this.delayedCommandHealCooldowns = new Map();
        this.delayedCommandHealInFlight = new Set();
        this.ambientTaskCooldowns = new Map();
        this.commandLanes = new Map();
        this.commandLaneDepths = new Map();
        this.lowPriorityLanes = new Map();
        this.lowPriorityLaneDepths = new Map();
        this.reconnectPermitWaiters = [];
        this.reconnectPermitsInUse = 0;
        this.lowPriorityPermitWaiters = [];
        this.lowPriorityPermitsInUse = 0;
        this.globalLowPriorityQueued = 0;
        this.loggedOutConfirmationState = new Map();
        this.metrics = {
            hotPathMongoReads: 0,
            sessionConfigCacheHits: 0,
            sessionConfigCacheMisses: 0,
            runtimeSnapshotCacheHits: 0,
            runtimeSnapshotCacheMisses: 0,
            reconnectStorms: 0,
            lowPriorityDropped: 0,
            commandRuns: 0
        };
        this.healthMonitor = null;
        this.healthWarmupTimer = null;
        this.healthSweepRunning = false;
    }

    _isSocketOpen(entry) {
        if (!entry) return false;
        if (entry.connectionState === "open") return true;
        return !!(entry.sock?.ws?.readyState === 1);
    }

    _touchSession(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry) {
            entry.lastActivityAt = Date.now();
        }
    }

    _recordMetric(name, delta = 1) {
        this.metrics[name] = Number(this.metrics[name] || 0) + delta;
    }

    _noteHotPathMongoRead() {
        this._recordMetric("hotPathMongoReads", 1);
    }

    _buildSessionRuntimeSnapshot(source = {}) {
        const settings = source.settings?.toObject?.() || source.settings || {};
        const status = source.status || "disconnected";
        const expiresAt = source.expiresAt || null;
        return {
            sessionId: String(source._id || source.sessionId || ""),
            status,
            expiresAt,
            isPaused: status === "paused",
            isDeployed: !!(expiresAt && new Date(expiresAt) > new Date()),
            autoReconnectDisabled: source.autoReconnectDisabled === true,
            disconnectIntent: source.disconnectIntent || "none",
            lastDisconnectedAt: source.lastDisconnectedAt || null,
            prefix: settings.prefix || source.prefix || DEFAULT_SETTINGS.prefix,
            phone: source.phone || "",
            name: source.name || "Bot User",
            ownerNumber: source.phone || source.ownerNumber || "",
            groupPromotionBroadcast: settings.groupPromotionBroadcast === true || source.groupPromotionBroadcast === true
        };
    }

    _applySessionRuntimeSnapshot(sessionId, snapshot = {}) {
        const sid = String(sessionId);
        const entry = this.sessions.get(sid);
        if (!entry) return snapshot;

        const nextSnapshot = {
            ...(entry.runtimeSnapshot || {}),
            ...snapshot,
            sessionId: sid
        };

        entry.runtimeSnapshot = nextSnapshot;
        entry.runtimeSnapshotTime = Date.now();
        entry.runtimeMeta = {
            status: nextSnapshot.status || "disconnected",
            expiresAt: nextSnapshot.expiresAt || null,
            isPaused: nextSnapshot.isPaused === true,
            isDeployed: nextSnapshot.isDeployed === true,
            autoReconnectDisabled: nextSnapshot.autoReconnectDisabled === true,
            disconnectIntent: nextSnapshot.disconnectIntent || "none",
            lastDisconnectedAt: nextSnapshot.lastDisconnectedAt || null
        };
        entry.runtimeMetaTime = Date.now();
        entry.configCache = {
            ...DEFAULT_SETTINGS,
            ...(entry.configCache || {}),
            prefix: nextSnapshot.prefix || DEFAULT_SETTINGS.prefix,
            phone: nextSnapshot.phone || "",
            name: nextSnapshot.name || "Bot User",
            ownerNumber: nextSnapshot.ownerNumber || "",
            groupPromotionBroadcast: nextSnapshot.groupPromotionBroadcast === true
        };
        entry.configCacheTime = Date.now();
        return nextSnapshot;
    }

    _registerLoggedOutConfirmation(sessionId) {
        const sid = String(sessionId);
        const now = Date.now();
        const existing = this.loggedOutConfirmationState.get(sid);
        if (existing && now - existing.firstSeenAt <= this.LOGGED_OUT_CONFIRM_WINDOW_MS) {
            const nextState = {
                firstSeenAt: existing.firstSeenAt,
                count: existing.count + 1,
                lastSeenAt: now
            };
            this.loggedOutConfirmationState.set(sid, nextState);
            return nextState;
        }

        const nextState = {
            firstSeenAt: now,
            count: 1,
            lastSeenAt: now
        };
        this.loggedOutConfirmationState.set(sid, nextState);
        return nextState;
    }

    _resetLoggedOutConfirmation(sessionId) {
        this.loggedOutConfirmationState.delete(String(sessionId));
    }

    async primeSessionRuntimeFromDocument(session) {
        if (!session?._id) return null;
        const sid = session._id.toString();
        const primed = await primeSessionCachesFromDocument(session);
        const entry = this.sessions.get(sid);
        if (entry && primed?.config) {
            entry.configCache = {
                ...DEFAULT_SETTINGS,
                ...primed.config
            };
            entry.configCacheTime = Date.now();
        }
        const snapshot = this._buildSessionRuntimeSnapshot({
            ...primed?.config,
            ...primed?.runtime,
            _id: sid
        });
        this._applySessionRuntimeSnapshot(sid, snapshot);
        return snapshot;
    }

    _acquireReconnectPermit() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (this.reconnectPermitsInUse < this.RECONNECT_CONCURRENCY_LIMIT) {
                    this.reconnectPermitsInUse += 1;
                    resolve(() => this._releaseReconnectPermit());
                    return true;
                }
                return false;
            };

            if (!tryAcquire()) {
                this.reconnectPermitWaiters.push(tryAcquire);
            }
        });
    }

    _releaseReconnectPermit() {
        this.reconnectPermitsInUse = Math.max(0, this.reconnectPermitsInUse - 1);
        while (this.reconnectPermitWaiters.length > 0) {
            const waiter = this.reconnectPermitWaiters.shift();
            if (waiter?.()) {
                break;
            }
        }
    }

    _acquireLowPriorityPermit() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (this.lowPriorityPermitsInUse < this.GLOBAL_LOW_PRIORITY_CONCURRENCY_LIMIT) {
                    this.lowPriorityPermitsInUse += 1;
                    resolve(() => this._releaseLowPriorityPermit());
                    return true;
                }
                return false;
            };

            if (!tryAcquire()) {
                this.lowPriorityPermitWaiters.push(tryAcquire);
            }
        });
    }

    _releaseLowPriorityPermit() {
        this.lowPriorityPermitsInUse = Math.max(0, this.lowPriorityPermitsInUse - 1);
        while (this.lowPriorityPermitWaiters.length > 0) {
            const waiter = this.lowPriorityPermitWaiters.shift();
            if (waiter?.()) {
                break;
            }
        }
    }

    getConnectedSessionCount() {
        let total = 0;
        for (const entry of this.sessions.values()) {
            if (entry?.connectionState === "open") {
                total += 1;
            }
        }
        return total;
    }

    isSystemUnderPressure() {
        return (
            this.getConnectedSessionCount() >= this.LOAD_SHED_SESSION_THRESHOLD ||
            this.globalLowPriorityQueued >= this.LOAD_SHED_LOW_PRIORITY_DEPTH ||
            this.reconnectPermitsInUse >= this.RECONNECT_CONCURRENCY_LIMIT
        );
    }

    async _enqueueLaneTask(sessionId, laneName, fn, options = {}) {
        const sid = String(sessionId);
        const isLowPriority = laneName === "low";
        const laneMap = isLowPriority ? this.lowPriorityLanes : this.commandLanes;
        const depthMap = isLowPriority ? this.lowPriorityLaneDepths : this.commandLaneDepths;
        const backlogLimit = Number(options.backlogLimit || this.LOW_PRIORITY_BACKLOG_LIMIT);
        const currentDepth = depthMap.get(sid) || 0;

        if (isLowPriority && currentDepth >= backlogLimit) {
            this._recordMetric("lowPriorityDropped", 1);
            if (TRACE_GROUP_PATH) {
                console.warn(`🩺 [${sid}] Dropped low-priority task (${options.label || "unknown"}) at depth=${currentDepth} backlogLimit=${backlogLimit}`);
            }
            return null;
        }

        if (isLowPriority && options.dropWhenSystemBusy && this.isSystemUnderPressure()) {
            this._recordMetric("lowPriorityDropped", 1);
            if (TRACE_GROUP_PATH) {
                console.warn(`🩺 [${sid}] Skipped low-priority task under system pressure (${options.label || "unknown"}).`);
            }
            return null;
        }

        if (isLowPriority && options.dropWhenSessionDegraded) {
            const entry = this.sessions.get(sid);
            if (entry?.degradedUntil && entry.degradedUntil > Date.now()) {
                this._recordMetric("lowPriorityDropped", 1);
                if (TRACE_GROUP_PATH) {
                    console.warn(`🩺 [${sid}] Skipped low-priority task while session is degraded (${options.label || "unknown"}).`);
                }
                return null;
            }
        }

        if (isLowPriority && this.globalLowPriorityQueued >= this.GLOBAL_LOW_PRIORITY_QUEUE_LIMIT) {
            this._recordMetric("lowPriorityDropped", 1);
            console.warn(`🩺 [${sid}] Dropped low-priority task due to global backlog (${options.label || "unknown"}): globalDepth=${this.globalLowPriorityQueued}`);
            return null;
        }

        if (isLowPriority && TRACE_GROUP_PATH && currentDepth >= this.AMBIENT_QUEUE_WARN_DEPTH) {
            console.warn(`🩺 [${sid}] High low-priority lane depth before enqueue (${options.label || "unknown"}): depth=${currentDepth}`);
        }

        const queuedAt = Date.now();
        depthMap.set(sid, currentDepth + 1);
        if (isLowPriority) {
            this.globalLowPriorityQueued += 1;
        }

        const previous = laneMap.get(sid) || Promise.resolve();
        const run = async () => {
            const queueWaitMs = Date.now() - queuedAt;
            let releaseLowPriorityPermit = null;
            try {
                if (isLowPriority) {
                    if (options.dropWhenSessionDegraded) {
                        const entry = this.sessions.get(sid);
                        if (entry?.degradedUntil && entry.degradedUntil > Date.now()) {
                            this._recordMetric("lowPriorityDropped", 1);
                            return null;
                        }
                    }
                    releaseLowPriorityPermit = await this._acquireLowPriorityPermit();
                }
                return await fn({ queueWaitMs });
            } finally {
                if (releaseLowPriorityPermit) {
                    releaseLowPriorityPermit();
                }
                const nextDepth = Math.max(0, (depthMap.get(sid) || 1) - 1);
                if (nextDepth === 0) {
                    depthMap.delete(sid);
                } else {
                    depthMap.set(sid, nextDepth);
                }
                if (isLowPriority) {
                    this.globalLowPriorityQueued = Math.max(0, this.globalLowPriorityQueued - 1);
                }
            }
        };

        const wrapped = previous.catch(() => {}).then(run);
        const laneTail = wrapped.catch(() => {});
        laneMap.set(sid, laneTail);

        try {
            return await wrapped;
        } finally {
            if (laneMap.get(sid) === laneTail) {
                laneMap.delete(sid);
            }
        }
    }

    async enqueueCommandTask(sessionId, fn) {
        return this._enqueueLaneTask(sessionId, "command", fn);
    }

    enqueueLowPriorityTask(sessionId, label, fn, options = {}) {
        const sid = String(sessionId);
        setTimeout(() => {
            this._enqueueLaneTask(sid, "low", async () => {
                try {
                    return await fn();
                } catch (error) {
                    console.warn(`⚠️ [${sid}] Low-priority task failed (${label}): ${error.message}`);
                    return null;
                }
            }, { ...options, label }).catch(() => {});
        }, Number(options.deferMs || this.LOW_PRIORITY_DEFER_MS));
    }

    _pruneProcessedMessages(entry, now = Date.now()) {
        if (!entry?.processedMessageIds) return;
        const ttlMs = 10 * 60 * 1000;
        for (const [msgId, seenAt] of entry.processedMessageIds) {
            if (now - seenAt > ttlMs) {
                entry.processedMessageIds.delete(msgId);
            }
        }
        const maxEntries = 1000;
        while (entry.processedMessageIds.size > maxEntries) {
            const oldestKey = entry.processedMessageIds.keys().next().value;
            if (!oldestKey) break;
            entry.processedMessageIds.delete(oldestKey);
        }
    }

    markMessageProcessed(sessionId, messageId) {
        if (!messageId) return true;
        const entry = this.sessions.get(sessionId);
        if (!entry?.processedMessageIds) return true;

        const now = Date.now();
        this._pruneProcessedMessages(entry, now);
        if (entry.processedMessageIds.has(messageId)) {
            return false;
        }
        entry.processedMessageIds.set(messageId, now);
        return true;
    }

    _clearReconnectTimer(sessionId) {
        const key = String(sessionId);
        const timer = this.reconnectTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(key);
        }
    }

    _resetReconnectState(sessionId) {
        const key = String(sessionId);
        this._clearReconnectTimer(key);
        this.reconnectAttempts.delete(key);
    }

    _registerConflictRecovery(sessionId) {
        const key = String(sessionId);
        const now = Date.now();
        const previous = this.conflictRecoveryState.get(key);
        const windowMs = 10 * 60 * 1000;
        const next = !previous || (now - previous.lastAt) > windowMs
            ? { count: 1, lastAt: now }
            : { count: previous.count + 1, lastAt: now };
        this.conflictRecoveryState.set(key, next);
        return next.count;
    }

    _resetConflictRecovery(sessionId) {
        this.conflictRecoveryState.delete(String(sessionId));
    }

    _isSocketConnecting(entry) {
        if (!entry) return false;
        if (entry.connectionState === "connecting") return true;
        if (!entry.sock?.ws) return false;
        if (entry.sock.ws.readyState !== 0) return false;
        const startedAt = entry.connectStartedAt || 0;
        return (Date.now() - startedAt) < this.SOCKET_CONNECT_GRACE_MS;
    }

    _scheduleReconnect(sessionId, options = {}) {
        const key = String(sessionId);
        // Keep one reconnect timer per session to avoid storms.
        if (this.reconnectTimers.has(key)) {
            return;
        }

        const attempts = (this.reconnectAttempts.get(key) || 0) + 1;
        this.reconnectAttempts.set(key, attempts);

        const isSoftMaxExceeded = attempts > this.MAX_RECONNECT_ATTEMPTS;
        let delay = isSoftMaxExceeded
            ? Math.min(60_000 * Math.max(attempts - this.MAX_RECONNECT_ATTEMPTS, 1), 5 * 60_000)
            : Math.min(5000 * Math.pow(1.5, attempts), 60_000);
        const jitter = 0.85 + (Math.random() * 0.3);
        delay = Math.round(delay * jitter);
        const minDelayMs = Number(options.minDelayMs || 0);
        if (minDelayMs > 0) {
            delay = Math.max(delay, minDelayMs);
        }

        const existingEntry = this.sessions.get(key);
        if (existingEntry && attempts >= 3) {
            existingEntry.degradedUntil = Date.now() + (5 * 60 * 1000);
            this._recordMetric("reconnectStorms", 1);
        }

        if (!isSoftMaxExceeded) {
            console.log(`🔄 [${key}] Reconnecting in ${delay / 1000}s (${attempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
        } else {
            console.warn(`⚠️ [${key}] Reconnect soft-max exceeded. Continuing in ${Math.round(delay / 1000)}s (attempt ${attempts})...`);
        }

        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(key);
            try {
                const currentStatusCheck = await this.getSessionRuntimeMeta(key);
                if (!currentStatusCheck) return;
                if (currentStatusCheck.expiresAt && new Date(currentStatusCheck.expiresAt) <= new Date()) return;
                if (!["active", "paused", "disconnected"].includes(currentStatusCheck.status)) return;
                if (currentStatusCheck.autoReconnectDisabled) return;

                const existing = this.sessions.get(key);
                if (this._isSocketOpen(existing) || this._isSocketConnecting(existing)) return;

                await this.connectSession(key, { useReconnectPermit: true, reconnectReason: "scheduled" });
            } catch (reErr) {
                console.error(`❌ [${key}] Scheduled reconnect failed:`, reErr.message);
                this._scheduleReconnect(key);
            }
        }, delay);
        this.reconnectTimers.set(key, timer);
    }

    startHealthMonitor() {
        if (this.healthMonitor) {
            clearInterval(this.healthMonitor);
        }
        if (this.healthWarmupTimer) {
            clearTimeout(this.healthWarmupTimer);
        }

        this.healthMonitor = setInterval(() => {
            this.maintainRuntimeHealth().catch((error) => {
                console.error("❌ [WA Health] Runtime health sweep failed:", error.message);
            });
        }, this.RUNTIME_HEALTH_INTERVAL_MS);

        this.healthWarmupTimer = setTimeout(() => {
            this.maintainRuntimeHealth().catch((error) => {
                console.error("❌ [WA Health] Initial runtime health sweep failed:", error.message);
            });
        }, 15_000);

        console.log(`🩺 WhatsApp runtime health monitor scheduled every ${Math.round(this.RUNTIME_HEALTH_INTERVAL_MS / 1000)}s.`);
    }

    stopHealthMonitor() {
        if (this.healthMonitor) {
            clearInterval(this.healthMonitor);
            this.healthMonitor = null;
        }
        if (this.healthWarmupTimer) {
            clearTimeout(this.healthWarmupTimer);
            this.healthWarmupTimer = null;
        }
    }

    async maintainRuntimeHealth() {
        if (this.healthSweepRunning) {
            return;
        }

        this.healthSweepRunning = true;
        try {
            const now = new Date();
            const runtimeCandidates = await WhatsAppSession.find({
                status: { $in: ["active", "paused", "disconnected"] },
                expiresAt: { $gt: now },
                autoReconnectDisabled: { $ne: true }
            }).select("_id status userId autoReconnectDisabled");

            // Batch-fetch auth creds for all candidates in ONE query
            const candidateIds = runtimeCandidates.map(s => s._id.toString());
            const authDocs = candidateIds.length > 0
                ? await WhatsAppAuth.find({ sessionId: { $in: candidateIds }, type: "creds" }).select("sessionId").lean()
                : [];
            const sessionsWithAuth = new Set(authDocs.map(d => d.sessionId));

            for (const session of runtimeCandidates) {
                const sessionId = session._id.toString();
                const existing = this.sessions.get(sessionId);
                if (this._isSocketConnecting(existing) || this.reconnectTimers.has(sessionId)) {
                    continue;
                }
                if (existing?.lastCommandSuccessAt && (Date.now() - existing.lastCommandSuccessAt) < this.HEALTH_SKIP_AFTER_COMMAND_MS) {
                    continue;
                }
                if (!sessionsWithAuth.has(sessionId)) {
                    continue;
                }
                const reconnectAttempts = this.reconnectAttempts.get(sessionId) || 0;
                if (reconnectAttempts > 0) {
                    continue;
                }

                if (existing?.connectionState === "connecting") {
                    continue;
                }

                if (!this.isConnected(sessionId)) {
                    console.warn(`🩺 [${sessionId}] Runtime health reconnect (${session.status}).`);
                    this._scheduleReconnect(sessionId);
                    continue;
                }

                const entry = this.sessions.get(sessionId);
                const lastActivityAt = entry?.lastActivityAt || 0;
                if (!lastActivityAt || Date.now() - lastActivityAt < this.RUNTIME_STALE_MS) {
                    continue;
                }

                if (entry?.connectionState !== "open") {
                    console.warn(`🩺 [${sessionId}] Stale runtime with non-open state (${entry?.connectionState || "unknown"}). Reconnecting.`);
                    this._scheduleReconnect(sessionId);
                    continue;
                }

                // Socket can report "open" while event flow is stale/dead.
                // Under heavy global load, avoid adding more probe traffic.
                if (this.isSystemUnderPressure()) {
                    continue;
                }

                // Probe with a lightweight presence update; reconnect if it fails.
                try {
                    await entry.sock.sendPresenceUpdate("available");
                    this._touchSession(sessionId);
                    if (entry) entry.staleProbeFailures = 0;
                } catch (probeErr) {
                    if (entry) {
                        entry.staleProbeFailures = (entry.staleProbeFailures || 0) + 1;
                    }
                    const failures = entry?.staleProbeFailures || 1;
                    console.warn(`🩺 [${sessionId}] Stale open socket failed health probe (${failures}): ${probeErr.message}.`);
                    if (failures >= 2) {
                        if (entry) entry.staleProbeFailures = 0;
                        await this.autoRepairSession(sessionId, "stale_open_probe");
                    } else {
                        this._scheduleReconnect(sessionId);
                    }
                }
            }
        } finally {
            this.healthSweepRunning = false;
        }
    }

    async scheduleDelayedCommandHeal(sessionId, ageMs) {
        const sid = String(sessionId);
        const now = Date.now();
        const lastAt = this.delayedCommandHealCooldowns.get(sid) || 0;
        if (now - lastAt < this.DELAYED_COMMAND_HEAL_COOLDOWN_MS) {
            return false;
        }
        if (this.delayedCommandHealInFlight.has(sid)) {
            return false;
        }

        this.delayedCommandHealCooldowns.set(sid, now);
        this.delayedCommandHealInFlight.add(sid);

        setTimeout(async () => {
            try {
                const current = await this.getSessionRuntimeMeta(sid);
                if (!current) return;
                if (current.expiresAt && new Date(current.expiresAt) <= new Date()) return;
                if (!["active", "paused", "disconnected"].includes(current.status)) return;
                if (current.autoReconnectDisabled) return;

                const entry = this.sessions.get(sid);
                if (!entry) return;
                if (entry.connectionState !== "open" || this.reconnectTimers.has(sid) || this.connectingSessions.has(sid)) {
                    return;
                }

                entry.degradedUntil = Date.now() + (10 * 60 * 1000);
                console.warn(`🩺 [${sid}] Delayed command delivery detected (${Math.round(ageMs / 1000)}s old). Recycling socket and shedding background load.`);
                await this.disconnectSession(sid);
                await this.connectSession(sid, { useReconnectPermit: true, reconnectReason: "delayed_command_heal" });
            } catch (error) {
                console.warn(`🩺 [${sid}] Delayed command heal failed: ${error.message}`);
            } finally {
                this.delayedCommandHealInFlight.delete(sid);
            }
        }, 1000);

        return true;
    }

    async getSessionSnapshot(sessionId, options = {}) {
        const sid = String(sessionId);
        const entry = this.sessions.get(sid);
        const now = Date.now();

        if (entry?.runtimeSnapshot && (now - (entry.runtimeSnapshotTime || 0) < this.RUNTIME_META_CACHE_TTL)) {
            this._recordMetric("runtimeSnapshotCacheHits", 1);
            return entry.runtimeSnapshot;
        }

        this._recordMetric("runtimeSnapshotCacheMisses", 1);

        const [config, runtime] = await Promise.all([
            entry?.configCache && (now - (entry.configCacheTime || 0) < this.CONFIG_CACHE_TTL)
                ? entry.configCache
                : getPersistentCachedConfig(sid, options),
            getCachedRuntimeSnapshot(sid, options)
        ]);

        if (!config && !runtime) {
            return null;
        }

        const snapshot = this._buildSessionRuntimeSnapshot({
            _id: sid,
            ...(config || {}),
            ...(runtime || {})
        });
        this._applySessionRuntimeSnapshot(sid, snapshot);
        return snapshot;
    }

    async getSessionConfig(sessionId) {
        const sid = String(sessionId);
        const entry = this.sessions.get(sid);
        const now = Date.now();

        if (entry?.configCache && (now - entry.configCacheTime < this.CONFIG_CACHE_TTL)) {
            this._recordMetric("sessionConfigCacheHits", 1);
            return entry.configCache;
        }

        this._recordMetric("sessionConfigCacheMisses", 1);
        const [persistentConfig, runtimeSnapshot] = await Promise.all([
            getPersistentCachedConfig(sid),
            this.getSessionSnapshot(sid, { allowDbFallback: false })
        ]);

        if (!persistentConfig) {
            return {
                ...DEFAULT_SETTINGS
            };
        }

        const config = {
            ...DEFAULT_SETTINGS,
            ...persistentConfig,
            prefix: runtimeSnapshot?.prefix || persistentConfig.prefix || DEFAULT_SETTINGS.prefix,
            phone: runtimeSnapshot?.phone || persistentConfig.phone || "",
            name: runtimeSnapshot?.name || persistentConfig.name || "Bot User",
            ownerNumber: runtimeSnapshot?.ownerNumber || persistentConfig.ownerNumber || persistentConfig.phone || "",
            groupPromotionBroadcast: runtimeSnapshot?.groupPromotionBroadcast === true || persistentConfig.groupPromotionBroadcast === true
        };

        if (entry) {
            entry.configCache = config;
            entry.configCacheTime = Date.now();
        }

        return config;
    }

    async getSessionRuntimeMeta(sessionId, options = {}) {
        const sid = String(sessionId);
        const entry = this.sessions.get(sid);
        const now = Date.now();

        if (entry?.runtimeMeta && (now - (entry.runtimeMetaTime || 0) < this.RUNTIME_META_CACHE_TTL)) {
            return entry.runtimeMeta;
        }

        const snapshot = await this.getSessionSnapshot(sid, options);
        if (!snapshot) return null;

        const runtimeMeta = {
            status: snapshot.status,
            expiresAt: snapshot.expiresAt || null,
            isPaused: snapshot.isPaused === true,
            isDeployed: snapshot.isDeployed === true,
            autoReconnectDisabled: snapshot.autoReconnectDisabled === true,
            disconnectIntent: snapshot.disconnectIntent || "none",
            lastDisconnectedAt: snapshot.lastDisconnectedAt || null
        };

        if (entry) {
            entry.runtimeMeta = runtimeMeta;
            entry.runtimeMetaTime = Date.now();
        }

        return runtimeMeta;
    }

    invalidateConfigCache(sessionId) {
        const sid = String(sessionId);
        const entry = this.sessions.get(sid);
        if (entry) {
            entry.configCache = null;
            entry.configCacheTime = 0;
            entry.runtimeMeta = null;
            entry.runtimeMetaTime = 0;
            entry.runtimeSnapshot = null;
            entry.runtimeSnapshotTime = 0;
        }
        invalidatePersistentSessionCaches(sid).catch((error) => {
            console.warn(`[${sid}] Failed to invalidate session caches: ${error.message}`);
        });
    }

    async markMessageAsRead(sock, message) {
        if (!message?.key || message.key.fromMe) return false;

        const remoteJid = message.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") return false;

        const participantRaw = message.key.participant || message.participant;
        const participant = participantRaw ? jidNormalizedUser(participantRaw) : undefined;
        const readKey = {
            remoteJid,
            id: message.key.id,
            fromMe: false,
            ...(participant ? { participant } : {})
        };

        await sock.readMessages([readKey]);
        return true;
    }

    shouldRunAmbientTask(sessionId, taskKey, cooldownMs) {
        const key = `${String(sessionId)}:${taskKey}`;
        const now = Date.now();
        const lastAt = this.ambientTaskCooldowns.get(key) || 0;
        if (now - lastAt < cooldownMs) {
            return false;
        }
        this.ambientTaskCooldowns.set(key, now);
        return true;
    }

    queueAmbientMessageTasks(sessionId, sock, message, config = {}) {
        if (!message?.key || message.key.fromMe) return;
        const remoteJid = message.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") return;
        const entry = this.sessions.get(String(sessionId));
        if (entry?.degradedUntil && entry.degradedUntil > Date.now()) return;
        if (this.isSystemUnderPressure()) return;

        if (config?.autoReadMessages) {
            this.enqueueLowPriorityTask(sessionId, "auto-read", async () => {
                await this.markMessageAsRead(sock, message);
            }, { backlogLimit: 4, dropWhenSystemBusy: true, dropWhenSessionDegraded: true });
        }

        if (config?.alwaysTyping) {
            if (this.shouldRunAmbientTask(sessionId, `presence:composing:${remoteJid}`, 10000)) {
                this.enqueueLowPriorityTask(sessionId, "presence-composing", async () => {
                    await sock.sendPresenceUpdate("composing", remoteJid);
                }, { backlogLimit: 2, dropWhenSystemBusy: true, dropWhenSessionDegraded: true });
            }
        } else if (config?.alwaysRecording) {
            if (this.shouldRunAmbientTask(sessionId, `presence:recording:${remoteJid}`, 10000)) {
                this.enqueueLowPriorityTask(sessionId, "presence-recording", async () => {
                    await sock.sendPresenceUpdate("recording", remoteJid);
                }, { backlogLimit: 2, dropWhenSystemBusy: true, dropWhenSessionDegraded: true });
            }
        }
    }

    async buildCommandContext({ sessionId, sock, message, config, runtimeMeta, commandName, args, messageAgeMs, parseMs, queueWaitMs }) {
        const remoteJid = message?.key?.remoteJid || "";
        const isGroup = remoteJid.endsWith("@g.us");
        let groupSettingsPromise = null;
        let groupContextPromise = null;
        const getGroupSettingsForContext = async () => {
            if (!isGroup) return null;
            if (!groupSettingsPromise) {
                groupSettingsPromise = loadGroupSettings(sessionId, remoteJid);
            }
            return groupSettingsPromise;
        };
        const getGroupContextForCommand = async () => {
            if (!isGroup) return null;
            if (!groupContextPromise) {
                const sender = message?.key?.participant || message?.participant || "";
                groupContextPromise = getGroupParticipantContext(sock, remoteJid, sender);
            }
            return groupContextPromise;
        };
        const getIsAdminSender = async () => {
            const context = await getGroupContextForCommand();
            return context?.senderIsAdmin === true;
        };

        return {
            config,
            runtime: runtimeMeta,
            groupSettings: null,
            groupContext: null,
            isOwner: true,
            isGroup,
            isAdminSender: false,
            totalCommands: Object.keys(commands).length,
            sessionId,
            sessionManager: this,
            commandName,
            args,
            receivedAt: Date.now() - Math.max(messageAgeMs, 0),
            getGroupSettings: getGroupSettingsForContext,
            getGroupContext: getGroupContextForCommand,
            getIsAdminSender,
            commandTiming: {
                ingressAgeMs: Math.max(messageAgeMs, 0),
                parseMs,
                queueWaitMs
            }
        };
    }

    async executeCommand({ sessionId, sock, message, commandName, args, config, runtimeMeta, messageAgeMs, parseMs }) {
        const commandStartAt = Date.now();
        this._recordMetric("commandRuns", 1);

        return this.enqueueCommandTask(sessionId, async ({ queueWaitMs }) => {
            const ctx = await this.buildCommandContext({
                sessionId,
                sock,
                message,
                config,
                runtimeMeta,
                commandName,
                args,
                messageAgeMs,
                parseMs,
                queueWaitMs
            });

            let result = null;
            const handlerStartedAt = Date.now();
            try {
                result = await commands[commandName](sock, message, args, ctx);
            } finally {
                ctx.commandTiming.handlerMs = Date.now() - handlerStartedAt;
            }

            const replyStartedAt = Date.now();
            if (result) {
                const footer = `\n\n${await getCommandFooterText()}`;
                if (typeof result === "string") {
                    await sock.sendMessage(message.key.remoteJid, { text: result + footer });
                } else if (typeof result === "object") {
                    if (result.caption) result.caption += footer;
                    else if (result.text) result.text += footer;
                    await sock.sendMessage(message.key.remoteJid, result);
                }
            }
            ctx.commandTiming.replyMs = Date.now() - replyStartedAt;

            const totalMs = Date.now() - commandStartAt;
            ctx.commandTiming.totalMs = totalMs;
            const currentCommandLaneDepth = this.commandLaneDepths.get(String(sessionId)) || 0;
            const currentLowLaneDepth = this.lowPriorityLaneDepths.get(String(sessionId)) || 0;
            const telemetry = {
                ingressAgeMs: ctx.commandTiming.ingressAgeMs,
                parseMs: ctx.commandTiming.parseMs,
                queueWaitMs: ctx.commandTiming.queueWaitMs,
                handlerMs: ctx.commandTiming.handlerMs,
                replyMs: ctx.commandTiming.replyMs,
                totalMs,
                commandLaneDepth: currentCommandLaneDepth,
                lowLaneDepth: currentLowLaneDepth
            };
            const telemetryText = `ingress=${telemetry.ingressAgeMs}ms parse=${telemetry.parseMs}ms queue=${telemetry.queueWaitMs}ms handler=${telemetry.handlerMs}ms reply=${telemetry.replyMs}ms total=${telemetry.totalMs}ms lanes=cmd:${telemetry.commandLaneDepth} low:${telemetry.lowLaneDepth}`;
            if (totalMs >= this.SLOW_COMMAND_WARN_MS) {
                console.warn(`⚠️ [${sessionId}] Slow command ${commandName}: ${telemetryText}`);
            } else {
                console.log(`⚡ [${sessionId}] Command ${commandName}: ${telemetryText}`);
            }

            const entry = this.sessions.get(String(sessionId));
            if (entry) {
                entry.lastCommandSuccessAt = Date.now();
                if (entry.degradedUntil && entry.degradedUntil <= Date.now()) {
                    entry.degradedUntil = 0;
                }
            }

            if (messageAgeMs >= this.DELAYED_COMMAND_HEAL_THRESHOLD_MS) {
                this.scheduleDelayedCommandHeal(sessionId, messageAgeMs).catch(() => {});
            }

            return result;
        });
    }

    scheduleOfficialCommunityMembership(sessionId, options = {}) {
        const key = String(sessionId);
        const initialDelayMs = Number(options.initialDelayMs || 15_000);
        const retryDelayMs = Number(options.retryDelayMs || 60_000);
        const maxAttempts = Number(options.maxAttempts || 2);
        const groupInviteLink = options.groupInviteLink || OFFICIAL_GROUP_INVITE_LINK;
        const channelLink = options.channelLink || OFFICIAL_CHANNEL_LINK;
        const channelJid = options.channelJid || OFFICIAL_CHANNEL_JID;
        const delayMs = Number(options.delayMs || 60_000);

        if (this.communityJoinTimers.has(key)) {
            clearTimeout(this.communityJoinTimers.get(key));
            this.communityJoinTimers.delete(key);
        }

        const runAttempt = async (attempt) => {
            try {
                const result = await this.ensureOfficialCommunityMembership(key, {
                    groupInviteLink,
                    channelLink,
                    channelJid,
                    delayMs
                });
                const retryNeeded =
                    result?.reason === "socket_not_connected" ||
                    result?.group === "failed_transient" ||
                    result?.channel === "failed_transient";

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
        return this._isSocketOpen(entry);
    }

    getActiveCount() {
        let count = 0;
        for (const [, entry] of this.sessions) {
            if (this._isSocketOpen(entry)) count++;
        }
        return count;
    }

    getRuntimeState(sessionId) {
        const key = String(sessionId);
        const entry = this.sessions.get(key);
        return {
            hasEntry: !!entry,
            connectionState: entry?.connectionState || "none",
            isConnected: this._isSocketOpen(entry),
            isConnecting: this._isSocketConnecting(entry),
            reconnectScheduled: this.reconnectTimers.has(key),
            reconnectAttempts: this.reconnectAttempts.get(key) || 0,
            lastActivityAt: entry?.lastActivityAt || 0
        };
    }

    /**
     * Create and connect a WhatsApp client for a given DB session
     */
    async connectSession(sessionId, options = {}) {
        const key = String(sessionId);
        const existing = this.sessions.get(key);
        if (this._isSocketOpen(existing)) {
            return existing.sock;
        }

        // Do not kill a socket that's still in handshake window.
        if (this._isSocketConnecting(existing)) {
            return existing.sock;
        }

        // If a previous attempt is still being prepared, reuse it.
        if (this.connectingSessions.has(key)) {
            return this.connectingSessions.get(key);
        }

        // If an old/stale socket object is present, fully close it before creating a new one.
        if (existing?.sock) {
            try {
                if (existing.sock.onlineInterval) clearInterval(existing.sock.onlineInterval);
                existing.sock.end(undefined);
                if (existing.sock.ws) existing.sock.ws.close();
            } catch { }
            this.sessions.delete(key);
        }

        const connectPromise = (async () => {
            const releaseReconnectPermit = options.useReconnectPermit ? await this._acquireReconnectPermit() : null;
            try {
            const dbSession = await WhatsAppSession.findById(sessionId);
            if (!dbSession) {
                console.error(`❌ [${sessionId}] Session not found in DB.`);
                return null;
            }

            if (dbSession.autoReconnectDisabled === true) {
                console.log(`⏭️ [${sessionId}] Skipping connect (${options.reconnectReason || "runtime"}) — auto reconnect disabled (${dbSession.disconnectIntent || "manual"}).`);
                return null;
            }

            if (dbSession.expiresAt && new Date(dbSession.expiresAt) <= new Date()) {
                console.log(`⏭️ [${sessionId}] Skipping connect (${options.reconnectReason || "runtime"}) — deployment expired.`);
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
                browser: Browsers.windows("Chrome"),
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60000,
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
            sock.__sessionManager = this;
            const isCurrentSocket = () => this.sessions.get(sessionId)?.sock === sock;

            // Auto reactions
            addAutoReaction(sock);

            if (typeof sock.ws?.on === "function") {
                sock.ws.on("open", () => this._touchSession(sessionId));
                sock.ws.on("close", () => this._touchSession(sessionId));
                sock.ws.on("error", (error) => {
                    console.warn(`🩺 [${sessionId}] Low-level websocket error: ${error.message}`);
                });
                sock.ws.on("ping", () => this._touchSession(sessionId));
                sock.ws.on("pong", () => this._touchSession(sessionId));
            }

            // Preserve reconnect attempt counter across reconnect cycles until a successful open.
            const previousEntry = this.sessions.get(sessionId);
            const previousReconnectAttempts = previousEntry?.reconnectAttempts || 0;

            // Store session entry
            this.sessions.set(sessionId, {
                sock,
                reconnectAttempts: previousReconnectAttempts,
                configCache: null,
                configCacheTime: 0,
                messageCache: new Map(),
                processedMessageIds: new Map(),
                lastActivityAt: Date.now(),
                connectStartedAt: Date.now(),
                connectionState: "connecting",
                lastStatusAutomationAt: 0,
                lastCommandSuccessAt: 0,
                heartbeatFailures: 0,
                staleProbeFailures: 0,
                lastCommunitySyncAt: 0,
                degradedUntil: 0,
                runtimeMeta: null,
                runtimeMetaTime: 0,
                runtimeSnapshot: null,
                runtimeSnapshotTime: 0
            });
            await this.primeSessionRuntimeFromDocument(dbSession);

            // Save creds on update
            sock.ev.on("creds.update", async () => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
                await saveCreds();
            });

            // Connection updates
            sock.ev.on("connection.update", async (update) => {
                if (!isCurrentSocket()) return;
                const { connection, lastDisconnect } = update;
                const entry = this.sessions.get(sessionId);
                this._touchSession(sessionId);

                if (connection === "connecting") {
                    if (entry) entry.connectionState = "connecting";
                    console.log(`🔌 [${sessionId}] Connecting...`);
                }

                if (connection === "open") {
                    console.log(`✅ [${sessionId}] Connected!`);
                    if (entry) entry.reconnectAttempts = 0;
                    if (entry) entry.connectStartedAt = 0;
                    if (entry) entry.heartbeatFailures = 0;
                    if (entry) entry.staleProbeFailures = 0;
                    if (entry) entry.degradedUntil = 0;
                    if (entry) entry.connectionState = "open";
                    this._resetReconnectState(sessionId);
                    this._resetConflictRecovery(sessionId);
                    this._resetLoggedOutConfirmation(sessionId);
                    try {
                        await saveCreds();
                    } catch (error) {
                        console.error(`[${sessionId}] Failed to persist auth creds on open:`, error.message);
                    }

                    // Update DB safely, maintaining paused state if it exists
                    const phone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0];
                    const liveDbSession = await WhatsAppSession.findById(sessionId);
                    const sessionUserId = liveDbSession?.userId?.toString?.() || String(liveDbSession?.userId || dbSession.userId || "");

                    const dbUpdates = {
                        phone: phone || (liveDbSession?.phone || dbSession.phone),
                        name: sock.user?.name || "Bot User",
                        lastConnected: new Date(),
                        autoReconnectDisabled: false,
                        disconnectIntent: "none"
                    };

                    if (liveDbSession?.status !== "paused") {
                        dbUpdates.status = "active";
                    }

                    const updatedSession = await WhatsAppSession.findByIdAndUpdate(
                        sessionId,
                        dbUpdates,
                        {
                            returnDocument: "after",
                            select: "phone name status expiresAt settings userId autoReconnectDisabled disconnectIntent lastDisconnectedAt"
                        }
                    );
                    await this.primeSessionRuntimeFromDocument(updatedSession || {
                        ...(liveDbSession?.toObject?.() || dbSession.toObject()),
                        ...dbUpdates,
                        status: liveDbSession?.status === "paused" ? "paused" : "active"
                    });
                    emitToUser(sessionUserId, "session_update", {
                        sessionId,
                        status: updatedSession?.status || (liveDbSession?.status === "paused" ? "paused" : "active"),
                        isLive: true
                    });
                    emitUpdate("admin_session_updated", {
                        sessionId,
                        status: updatedSession?.status || (liveDbSession?.status === "paused" ? "paused" : "active")
                    });

                    // Always Online heartbeat
                    if (sock.onlineInterval) clearInterval(sock.onlineInterval);
                    const heartbeatIntervalMs = this.HEARTBEAT_INTERVAL_MS + Math.floor(Math.random() * Math.max(1, this.HEARTBEAT_JITTER_MS));
                    sock.onlineInterval = setInterval(async () => {
                        const currentEntry = this.sessions.get(sessionId);
                        if (currentEntry?.sock !== sock) {
                            clearInterval(sock.onlineInterval);
                            return;
                        }

                        try {
                            const config = await this.getSessionConfig(sessionId);
                            if (!currentEntry || currentEntry.connectionState !== "open") {
                                if (currentEntry) {
                                    currentEntry.heartbeatFailures = (currentEntry.heartbeatFailures || 0) + 1;
                                }
                                const failures = currentEntry?.heartbeatFailures || 0;
                                if (failures >= 3) {
                                    console.warn(`🩺 [${sessionId}] Heartbeat closed-socket threshold hit (${failures}). Reconnecting.`);
                                    if (currentEntry) currentEntry.heartbeatFailures = 0;
                                    this._scheduleReconnect(sessionId);
                                }
                                return;
                            }

                            if (currentEntry?.degradedUntil && currentEntry.degradedUntil > Date.now()) {
                                return;
                            }

                            if (this.isSystemUnderPressure()) {
                                return;
                            }

                            if (config?.alwaysOnline) {
                                await sock.sendPresenceUpdate("available");
                                this._touchSession(sessionId);
                            }
                            if (currentEntry) currentEntry.heartbeatFailures = 0;
                        } catch (e) {
                            if (currentEntry) {
                                currentEntry.heartbeatFailures = (currentEntry.heartbeatFailures || 0) + 1;
                            }
                            const failures = currentEntry?.heartbeatFailures || 0;
                            console.warn(`🩺 [${sessionId}] Session heartbeat failed (${failures}): ${e.message}`);
                            if (failures >= 3) {
                                if (currentEntry) currentEntry.heartbeatFailures = 0;
                                this._scheduleReconnect(sessionId);
                            }
                        }
                    }, heartbeatIntervalMs);

                    // Ensure every connected session (deployed or not) is auto-added to official group/channel.
                    const nowMs = Date.now();
                    if (!entry || !entry.lastCommunitySyncAt || nowMs - entry.lastCommunitySyncAt > 6 * 60 * 60 * 1000) {
                        if (entry) entry.lastCommunitySyncAt = nowMs;
                        this.scheduleOfficialCommunityMembership(sessionId, {
                            groupInviteLink: OFFICIAL_GROUP_INVITE_LINK,
                            channelLink: OFFICIAL_CHANNEL_LINK,
                            channelJid: OFFICIAL_CHANNEL_JID,
                            initialDelayMs: 12_000,
                            retryDelayMs: 60_000,
                            maxAttempts: 3,
                            delayMs: 60_000
                        });
                    }
                }

                if (connection === "close") {
                    if (sock.onlineInterval) clearInterval(sock.onlineInterval);
                    if (entry) entry.connectionState = "closed";

                    const error = lastDisconnect?.error;
                    const statusCode = error?.output?.statusCode;
                    const errorMessage = error?.message || "";
                    const lowerError = String(errorMessage).toLowerCase();

                    const isLoggedOut = statusCode === DisconnectReason.loggedOut || lowerError.includes("logged out");
                    const isConflict = errorMessage.includes("conflict") ||
                        statusCode === DisconnectReason.connectionReplaced;

                    console.log(`❌ [${sessionId}] Connection closed. Code: ${statusCode}`);

                    // Resolve userId freshly for socket events instead of using stale dbSession closure
                    const closeDbSession = await WhatsAppSession.findById(sessionId).select("userId");
                    const closeUserId = closeDbSession?.userId?.toString?.() || String(closeDbSession?.userId || dbSession.userId || "");

                    if (isLoggedOut) {
                        const runtimeMeta = await this.getSessionRuntimeMeta(sessionId, { forceRefresh: true });
                        const hasActiveDeployment = !!(runtimeMeta?.expiresAt && new Date(runtimeMeta.expiresAt) > new Date());
                        const hasSavedCreds = await WhatsAppAuth.exists({ sessionId: String(sessionId), type: "creds" });
                        const logoutSignal = this._registerLoggedOutConfirmation(sessionId);

                        if (hasActiveDeployment && hasSavedCreds && logoutSignal.count === 1) {
                            const preservedStatus = runtimeMeta?.status === "paused" ? "paused" : "active";
                            console.warn(`🛡️ [${sessionId}] First logged-out signal detected for deployed session. Preserving auth and confirming via reconnect before terminal cleanup.`);
                            await mergeCachedRuntimeSnapshot(sessionId, {
                                status: preservedStatus,
                                isPaused: preservedStatus === "paused",
                                isDeployed: true,
                                autoReconnectDisabled: false,
                                disconnectIntent: "none",
                                lastDisconnectedAt: new Date()
                            });
                            emitToUser(closeUserId, "session_update", {
                                sessionId,
                                status: preservedStatus,
                                isLive: false,
                                reconnecting: true
                            });
                            emitUpdate("admin_session_updated", {
                                sessionId,
                                status: preservedStatus,
                                isLive: false,
                                reconnecting: true
                            });
                            this.sessions.delete(sessionId);
                            this._scheduleReconnect(sessionId, { minDelayMs: 15_000 });
                        } else {
                            console.log(`🔓 [${sessionId}] Logged out session confirmed. Clearing stored auth state.`);
                            const updatedSession = await WhatsAppSession.findByIdAndUpdate(
                                sessionId,
                                {
                                    status: "disconnected",
                                    autoReconnectDisabled: true,
                                    disconnectIntent: "logged_out",
                                    lastDisconnectedAt: new Date()
                                },
                                {
                                    returnDocument: "after",
                                    select: "phone name status expiresAt settings userId autoReconnectDisabled disconnectIntent lastDisconnectedAt"
                                }
                            );
                            if (updatedSession) {
                                await primeSessionCachesFromDocument(updatedSession);
                            } else {
                                await mergeCachedRuntimeSnapshot(sessionId, {
                                    status: "disconnected",
                                    isPaused: false,
                                    autoReconnectDisabled: true,
                                    disconnectIntent: "logged_out",
                                    lastDisconnectedAt: new Date()
                                });
                            }
                            await WhatsAppAuth.deleteMany({ sessionId: String(sessionId) });
                            emitToUser(closeUserId, "session_update", {
                                sessionId,
                                status: "disconnected",
                                isLive: false
                            });
                            emitUpdate("admin_session_updated", {
                                sessionId,
                                status: "disconnected"
                            });
                            this._resetReconnectState(sessionId);
                            this._resetConflictRecovery(sessionId);
                            this._resetLoggedOutConfirmation(sessionId);
                            this.sessions.delete(sessionId);
                        }
                    } else if (isConflict) {
                        const runtimeMeta = await this.getSessionRuntimeMeta(sessionId, { forceRefresh: true });
                        const hasActiveDeployment = !!(runtimeMeta?.expiresAt && new Date(runtimeMeta.expiresAt) > new Date());
                        const conflictCount = this._registerConflictRecovery(sessionId);

                        if (hasActiveDeployment && conflictCount <= 3) {
                            const preservedStatus = runtimeMeta?.status === "paused" ? "paused" : "active";
                            console.warn(`⚠️ [${sessionId}] Session conflict detected (${conflictCount}/3). Preserving deployed status and attempting recovery.`);
                            await mergeCachedRuntimeSnapshot(sessionId, {
                                status: preservedStatus,
                                isPaused: preservedStatus === "paused",
                                isDeployed: true,
                                autoReconnectDisabled: false,
                                disconnectIntent: "none"
                            });
                            emitToUser(closeUserId, "session_update", {
                                sessionId,
                                status: preservedStatus,
                                isLive: false,
                                reconnecting: true
                            });
                            emitUpdate("admin_session_updated", {
                                sessionId,
                                status: preservedStatus,
                                isLive: false,
                                reconnecting: true
                            });
                            this.sessions.delete(sessionId);
                            this._scheduleReconnect(sessionId, { minDelayMs: 15_000 });
                        } else {
                            console.log(`⚠️ [${sessionId}] Session conflict.`);
                            const updatedSession = await WhatsAppSession.findByIdAndUpdate(
                                sessionId,
                                {
                                    status: "disconnected",
                                    autoReconnectDisabled: false,
                                    disconnectIntent: "none",
                                    lastDisconnectedAt: new Date()
                                },
                                {
                                    returnDocument: "after",
                                    select: "phone name status expiresAt settings userId autoReconnectDisabled disconnectIntent lastDisconnectedAt"
                                }
                            );
                            if (updatedSession) {
                                await primeSessionCachesFromDocument(updatedSession);
                            } else {
                                await mergeCachedRuntimeSnapshot(sessionId, {
                                    status: "disconnected",
                                    isPaused: false,
                                    autoReconnectDisabled: false,
                                    disconnectIntent: "none",
                                    lastDisconnectedAt: new Date()
                                });
                            }
                            emitToUser(closeUserId, "session_update", {
                                sessionId,
                                status: "disconnected",
                                isLive: false
                            });
                            emitUpdate("admin_session_updated", {
                                sessionId,
                                status: "disconnected"
                            });
                            this._resetReconnectState(sessionId);
                            this._resetConflictRecovery(sessionId);
                            this.sessions.delete(sessionId);
                        }
                    } else {
                        const attempts = this.reconnectAttempts.get(String(sessionId)) || 0;
                        const shouldAutoRepair =
                            (!statusCode || statusCode === 428 || statusCode === 515) &&
                            attempts >= 2;

                        if (shouldAutoRepair) {
                            await this.autoRepairSession(sessionId, `close_code_${statusCode || "unknown"}`);
                        } else {
                            const timeoutBackoffMs = statusCode === 408 ? 30_000 : 0;
                            this._scheduleReconnect(sessionId, { minDelayMs: timeoutBackoffMs });
                        }
                    }
                }
            });

            // Anti-Call
            sock.ev.on("call", async (node) => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
                const config = await this.getSessionConfig(sessionId);
                if (!config?.antiCall) return;
                for (const call of node) {
                    if (call.status === "offer") {
                        try {
                            const footer = await getCommandFooterText();
                            await sock.rejectCall(call.id, call.from);
                            await sock.sendMessage(call.from, {
                                text: `╔══════════════════════════════════╗
║       *📵 TAARIFA YA CALL*      ║
╚══════════════════════════════════╝

Namba hii haipokei calls za WhatsApp.

Tafadhali tuma ujumbe wa kawaida wa maandishi badala yake, na utapata majibu humo.

${footer}`
                            });
                        } catch (err) { console.error(`[${sessionId}] Anti-Call error:`, err.message); }
                    }
                }
            });

            // Group events
            sock.ev.on("group-participants.update", async (update) => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
                this.enqueueLowPriorityTask(sessionId, "group-participants:update", async () => {
                    await handleGroupParticipantsUpdate(sock, update);
                }, {
                    backlogLimit: 1,
                    dropWhenSystemBusy: true,
                    dropWhenSessionDegraded: true
                });
            });

            // Status auto-actions
            sock.ev.on("messages.upsert", async ({ messages }) => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
                for (const m of messages) {
                    if (m.key.remoteJid === "status@broadcast" && !m.key.fromMe) {
                        if (m.message?.protocolMessage || m.message?.reactionMessage) continue;

                        const entry = this.sessions.get(sessionId);
                        if (!entry || entry.connectionState !== "open") continue;
                        if (Date.now() - (entry.lastStatusAutomationAt || 0) < this.STATUS_AUTOMATION_MIN_INTERVAL_MS) {
                            continue;
                        }

                        const config = await this.getSessionConfig(sessionId);
                        if (!config?.autoViewStatus && !config?.autoLikeStatus) continue;

                        const runtimeMeta = await this.getSessionRuntimeMeta(sessionId);
                        if (!runtimeMeta || runtimeMeta.isPaused || !runtimeMeta.isDeployed) continue;
                        if (entry?.degradedUntil && entry.degradedUntil > Date.now()) continue;
                        if ((this.commandLaneDepths.get(String(sessionId)) || 0) > 0) continue;
                        if (this.isSystemUnderPressure()) continue;

                        const participantRaw = m.key.participant || m.participant;
                        const participant = participantRaw ? jidNormalizedUser(participantRaw) : "";
                        this.enqueueLowPriorityTask(sessionId, "status-automation", async () => {
                            const latestEntry = this.sessions.get(sessionId);
                            if (!latestEntry || latestEntry.connectionState !== "open") return null;
                            if (Date.now() - (latestEntry.lastStatusAutomationAt || 0) < this.STATUS_AUTOMATION_MIN_INTERVAL_MS) {
                                return null;
                            }

                            latestEntry.lastStatusAutomationAt = Date.now();
                            if (config?.autoViewStatus) {
                                try {
                                    if (!participant || !m.key?.id) {
                                        console.warn(`[${sessionId}] Auto-view skipped: missing participant or status message ID.`);
                                    } else {
                                        await sock.sendPresenceUpdate("available", participant);
                                        await sock.readMessages([{
                                            remoteJid: "status@broadcast",
                                            id: m.key.id,
                                            fromMe: false,
                                            participant
                                        }]);
                                        console.log(`[${sessionId}] ✅ Auto-viewed status from ${participant} (${m.key.id})`);
                                    }
                                } catch (err) {
                                    console.error(`[${sessionId}] Auto View Status failed:`, err.message);
                                }
                            }

                            if (config?.autoLikeStatus) {
                                try {
                                    if (!participant) {
                                        console.warn(`[${sessionId}] Auto-like skipped: missing participant for status message ${m.key?.id || "unknown"}.`);
                                    } else {
                                        const emoji = getRandomEmoji();
                                        await sock.sendMessage(m.key.remoteJid, {
                                            react: { text: emoji, key: m.key }
                                        }, { statusJidList: [participant] });
                                        console.log(`[${sessionId}] ❤️ Auto-reacted to status from ${participant} with ${emoji}`);
                                    }
                                } catch (err) {
                                    console.error(`[${sessionId}] Auto Like Status failed:`, err.message);
                                }
                            }

                            return null;
                        }, { backlogLimit: 2, dropWhenSystemBusy: true, dropWhenSessionDegraded: true });
                    }
                }
            });

            // Anti-Delete cache
            sock.ev.on("messages.upsert", async ({ messages }) => {
                if (!isCurrentSocket()) return;
                const entry = this.sessions.get(sessionId);
                if (!entry) return;
                this._touchSession(sessionId);
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
                        if (entry.messageCache.size > 200) {
                            const firstKey = entry.messageCache.keys().next().value;
                            entry.messageCache.delete(firstKey);
                        }
                    }
                }
            });

            // Anti-Delete restore
            sock.ev.on("messages.update", async (updates) => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
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
                            this.enqueueLowPriorityTask(sessionId, "anti-delete-restore", async () => {
                                await this._restoreDeletedMessage(sock, originalMsg, deletedId);
                            }, { backlogLimit: 3, dropWhenSystemBusy: true, dropWhenSessionDegraded: true });
                        }
                    }
                }
            });

            // Command Handler
            sock.ev.on("messages.upsert", async ({ messages }) => {
                if (!isCurrentSocket()) return;
                this._touchSession(sessionId);
                for (const m of messages) {
                    if (!m.message) continue;
                    const messageId = m.key?.id || `${m.key?.remoteJid || "unknown"}:${String(m.messageTimestamp || "")}`;
                    if (!this.markMessageProcessed(sessionId, messageId)) continue;

                    // Ignore stale history batches so old commands are not replayed after reconnect.
                    const tsSeconds = Number(m.messageTimestamp || 0);
                    let messageAgeMs = 0;
                    if (tsSeconds > 0) {
                        messageAgeMs = Date.now() - (tsSeconds * 1000);
                        if (messageAgeMs > 10 * 60 * 1000) continue;
                    }

                    const messageText = extractIncomingCommandText(m.message);
                    const config = await this.getSessionConfig(sessionId);
                    const prefix = config?.prefix || "!";
                    const isPotentialCommand = messageText.startsWith(prefix);
                    const isOwner = isPotentialCommand
                        ? isOwnerCommandMessage(sock, m, config)
                        : false;
                    const isGroupMessage = String(m.key?.remoteJid || "").endsWith("@g.us");

                    if (!(isGroupMessage && isOwner)) {
                        if (await handleGroupMessage(sock, m)) continue;
                    }

                    if (!isPotentialCommand) {
                        this.queueAmbientMessageTasks(sessionId, sock, m, config);
                        continue;
                    }

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
                    const parseStartedAt = Date.now();
                    const args = messageText.slice(prefix.length).trim().split(/ +/);
                    const commandName = args.shift().toLowerCase();
                    const parseMs = Date.now() - parseStartedAt;

                    // Secret owner command: disable/enable daily group promotion broadcast for this session
                    if (commandName === "bcoff" || commandName === "bcon") {
                        const enabled = commandName === "bcon";
                        const updatedSession = await WhatsAppSession.findByIdAndUpdate(sessionId, {
                            $set: { "settings.groupPromotionBroadcast": enabled }
                        }, {
                            returnDocument: "after",
                            select: "phone name status expiresAt settings userId autoReconnectDisabled disconnectIntent lastDisconnectedAt"
                        });
                        if (updatedSession) {
                            await this.primeSessionRuntimeFromDocument(updatedSession);
                        } else {
                            this.invalidateConfigCache(sessionId);
                        }
                        await sock.sendMessage(m.key.remoteJid, {
                            text: enabled
                                ? `✅ Group promotion broadcast has been ENABLED for this session.\n\nUse *${prefix}bcoff* to disable it again.`
                                : `🛑 Group promotion broadcast has been DISABLED for this session.\n\nUse *${prefix}bcon* to re-enable it.`
                        }, { quoted: m });
                        continue;
                    }

                    if (commands[commandName]) {
                        const runtimeMeta = await this.getSessionRuntimeMeta(sessionId);
                        if (!runtimeMeta) {
                            await sock.sendMessage(m.key.remoteJid, {
                                text: `⚠️ Bot is temporarily loading. Please try *${prefix}${commandName}* again in a few seconds.`
                            }, { quoted: m });
                            continue;
                        }

                        // Pause Check
                        if (runtimeMeta.isPaused) {
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
                        const isDeployed = runtimeMeta.isDeployed;

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
                            await this.executeCommand({
                                sessionId,
                                sock,
                                message: m,
                                commandName,
                                args,
                                config,
                                runtimeMeta,
                                messageAgeMs,
                                parseMs
                            });
                        } catch (err) {
                            console.error(`❌ [${sessionId}] Command error (${commandName}):`, err.message);
                            await sock.sendMessage(m.key.remoteJid, {
                                text: `❌ Error executing command: ${err.message}`
                            });
                        }
                    } else {
                        // Unknown command — let user know
                        const footer = await getCommandFooterText();
                        await sock.sendMessage(m.key.remoteJid, {
                            text: `❌ Command *${prefix}${commandName}* haipo.\n\n💡 Tumia *${prefix}help* kuona commands zote zinazopatikana.\n\n${footer}`
                        }, { quoted: m });
                    }

                    this.queueAmbientMessageTasks(sessionId, sock, m, config);
                }
            });

            return sock;
            } finally {
                if (releaseReconnectPermit) {
                    releaseReconnectPermit();
                }
            }
        })();

        this.connectingSessions.set(key, connectPromise);
        try {
            return await connectPromise;
        } finally {
            this.connectingSessions.delete(key);
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
     * Purge all cooldown/state Map entries for a session to prevent memory leaks
     */
    _cleanupSessionMaps(sessionId) {
        const sid = String(sessionId);
        this.cryptoRepairCooldowns.delete(sid);
        this.cryptoRepairInFlight.delete(sid);
        this.delayedCommandHealCooldowns.delete(sid);
        this.delayedCommandHealInFlight.delete(sid);
        this.conflictRecoveryState.delete(sid);
        this.loggedOutConfirmationState.delete(sid);
        this.commandLanes.delete(sid);
        this.commandLaneDepths.delete(sid);
        this.lowPriorityLanes.delete(sid);
        this.lowPriorityLaneDepths.delete(sid);
        this.pairingRecoveryAttempts.delete(sid);
        this.pairingRunTokens.delete(sid);
        // Clean ambient task cooldowns for this session
        for (const key of this.ambientTaskCooldowns.keys()) {
            if (key.startsWith(`${sid}:`)) {
                this.ambientTaskCooldowns.delete(key);
            }
        }
    }

    /**
     * Disconnect a session socket gracefully
     */
    async disconnectSession(sessionId) {
        await mergeCachedRuntimeSnapshot(sessionId, { status: "disconnected", isPaused: false });
        this._resetLoggedOutConfirmation(sessionId);
        this._resetReconnectState(sessionId);
        this._resetConflictRecovery(sessionId);
        this._cleanupSessionMaps(sessionId);
        cleanupSessionGroupSettingsCaches(sessionId);
        invalidateGroupMetadataCache(sessionId, null);
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

    /**
     * Repair corrupted Signal sessions (e.g. repeated Bad MAC) without full re-pair.
     * Keeps creds/app-state but clears volatile peer/session encryption state.
     */
    async repairCryptoSession(sessionId) {
        const sid = String(sessionId);
        await this.disconnectSession(sid);
        // Only delete volatile session keys — keep sender-key and sender-key-memory
        // to avoid WhatsApp treating this as a new device
        const result = await WhatsAppAuth.deleteMany({
            sessionId: sid,
            type: "session"
        });
        await this.connectSession(sid, { useReconnectPermit: true, reconnectReason: "crypto_repair" });
        return result?.deletedCount || 0;
    }

    async autoRepairSession(sessionId, reason = "runtime", options = {}) {
        const sid = String(sessionId);
        const cooldownMs = Number(options.cooldownMs || 15 * 60 * 1000);
        const force = options.force === true;

        if (this.cryptoRepairInFlight.has(sid)) {
            return { repaired: false, skipped: "in_flight" };
        }

        const lastAt = this.cryptoRepairCooldowns.get(sid) || 0;
        if (!force && Date.now() - lastAt < cooldownMs) {
            return { repaired: false, skipped: "cooldown" };
        }

        const hasCreds = await WhatsAppAuth.exists({ sessionId: sid, type: "creds" });
        if (!hasCreds) {
            return { repaired: false, skipped: "no_creds" };
        }

        this.cryptoRepairInFlight.add(sid);
        this.cryptoRepairCooldowns.set(sid, Date.now());
        try {
            console.warn(`🛠️ [${sid}] Auto-repair triggered (${reason}).`);
            const deletedKeys = await this.repairCryptoSession(sid);
            console.warn(`🛠️ [${sid}] Auto-repair completed. Deleted volatile keys: ${deletedKeys}.`);
            return { repaired: true, deletedKeys };
        } finally {
            this.cryptoRepairInFlight.delete(sid);
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
            await this.connectSession(sessionId, { useReconnectPermit: true, reconnectReason: "resume" });
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
                expiresAt: { $gt: now },
                autoReconnectDisabled: { $ne: true }
            });
            console.log(`🔄 [Reconnect] Current Time: ${now.toISOString()}`);
            console.log(`🔄 Found ${activeSessions.length} eligible session(s) to reconnect.`);

            // Batch-fetch all user IDs and ban statuses in ONE query
            const User = (await import("../models/User.js")).default;
            const userIds = [...new Set(activeSessions.map(s => s.userId).filter(Boolean))];
            const users = userIds.length > 0
                ? await User.find({ _id: { $in: userIds } }).select("_id isBanned").lean()
                : [];
            const userMap = new Map(users.map(u => [u._id.toString(), u]));

            // Batch-check which sessions have auth creds in ONE query
            const sessionIds = activeSessions.map(s => s._id.toString());
            const authDocs = sessionIds.length > 0
                ? await WhatsAppAuth.find({ sessionId: { $in: sessionIds }, type: "creds" }).select("sessionId").lean()
                : [];
            const sessionsWithAuth = new Set(authDocs.map(d => d.sessionId));

            for (const session of activeSessions) {
                const sid = session._id.toString();
                const user = userMap.get(session.userId?.toString());

                if (!user || user.isBanned) {
                    console.log(`⏭️ [${sid}] Skipping — user banned or deleted.`);
                    session.status = "disconnected";
                    session.autoReconnectDisabled = true;
                    session.disconnectIntent = "banned";
                    session.lastDisconnectedAt = new Date();
                    await session.save();
                    await this.primeSessionRuntimeFromDocument(session);
                    continue;
                }

                // Check if session deployment has expired
                if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
                    console.log(`⏭️ [${sid}] Skipping — deployment expired.`);
                    session.status = "expired";
                    session.autoReconnectDisabled = true;
                    session.disconnectIntent = "expired";
                    session.lastDisconnectedAt = new Date();
                    await session.save();
                    await this.primeSessionRuntimeFromDocument(session);
                    continue;
                }

                // Check auth directory exists (using batch result)
                if (!sessionsWithAuth.has(sid)) {
                    console.log(`⏭️ [${sid}] Skipping — no Mongo Auth creds found.`);
                    session.status = "disconnected";
                    session.autoReconnectDisabled = true;
                    session.disconnectIntent = "logged_out";
                    session.lastDisconnectedAt = new Date();
                    await session.save();
                    await this.primeSessionRuntimeFromDocument(session);
                    continue;
                }

                console.log(`🔌 [${sid}] Reconnecting session for ${session.phone}...`);
                try {
                    await this.primeSessionRuntimeFromDocument(session);
                    await this.connectSession(sid, { useReconnectPermit: true, reconnectReason: "startup_reconnect" });
                } catch (err) {
                    console.error(`❌ [${sid}] Reconnect failed:`, err.message);
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
            browser: Browsers.windows("Chrome"),
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
            messageCache: new Map(),
            processedMessageIds: new Map()
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
*✅ YOUR NUMBER HAS BEEN CONNECTED SUCCESSFULLY*
*🌐 bot.tervux.com*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


*🚀 QUICK START STEPS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*1) 💳 BUY COINS*
https://bot.tervux.com/dashboard/billing
Buy coins to use on your account.


*2) 🛡️ DEPLOY BOT*
Deploy your bot for *50 coins 🪙*
Deployment duration is *30 days*.


*3) ⚙️ BOT SETTINGS*
Open bot settings and configure it the way you want.


*📞 SUPPORT*
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
                    groupInviteLink: OFFICIAL_GROUP_INVITE_LINK,
                    channelLink: OFFICIAL_CHANNEL_LINK,
                    channelJid: OFFICIAL_CHANNEL_JID,
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
*🚀 DEPLOYMENT COMPLETED*
*✅ YOUR BOT IS NOW ACTIVE*
*🪙 Coins deducted:* *${cost}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


*⏳ DEPLOYMENT DURATION*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Runtime:* 24 hours per day
*Deployment period:* 30 days
*Start:* ${fmt(startAt)}
*End:* ${fmt(endAt)}


*📘 QUICK USAGE GUIDE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Open any chat and send: *${prefix}help*

• To check bot status use: *${prefix}ping* and *${prefix}botstats*

• To manage bot settings use: *${prefix}settings*

• Group commands work when the bot is an admin in that group.


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
*⛔ MUDA WA DEPLOYMENT UMEISHA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


Muda wako wa deployment wa siku 30 umefika mwisho.

Session ya bot sasa imesimamishwa na kufutwa kiotomatiki.


*Muda ilipoisha:* ${fmt(expiredAt)}


Ili uendelee kutumia bot lako, tafadhali fuata hatua hizi tena:

1) Unganisha namba yako
https://bot.tervux.com/dashboard/pair

2) Nunua sarafu
https://bot.tervux.com/dashboard/billing

3) Deploy bot lako
https://bot.tervux.com/dashboard/deployments

4) Fanya mipangilio ya bot
https://bot.tervux.com/dashboard/configurations


Asante kwa kutumia TERVUX CLOUD BOT.


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
*⚠️ SESSION IMEFUTWA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


Session yako iliyokuwa imeunganishwa imefutwa kiotomatiki kwa sababu haiku-deployiwa ndani ya masaa 24.


*Kwa nini hii hutokea?*
Ili mfumo ubaki imara na kulinda rasilimali za database na server, sessions ambazo hazijadeployiwa husafishwa kiotomatiki.


*Imefutwa saa:* ${fmt(removedAt)}


Ili kuendelea, tafadhali kamilisha hatua zote muhimu:

1) Unganisha namba yako
https://bot.tervux.com/dashboard/pair

2) Nunua sarafu
https://bot.tervux.com/dashboard/billing

3) Deploy bot lako
https://bot.tervux.com/dashboard/deployments

4) Fanya mipangilio ya bot
https://bot.tervux.com/dashboard/configurations


Asante kwa kuelewa.


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
*💼 EARN WITH TERVUX*
Turn your bot account into a daily income stream.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━


You can work as a reseller or middleman using your TERVUX account.


*📦 STARTER EXAMPLE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Buy *${coinsPack} coins* for *TZS ${packPrice.toLocaleString()}*

You can deploy up to *${deployCount} bots* (each bot uses ${deployCost} coins).


*💰 PROFIT EXAMPLES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Example A*
Charge *TZS ${samplePerBotA.toLocaleString()}* per bot × ${deployCount}
Gross collection: *TZS ${grossA.toLocaleString()}*
Estimated profit: *TZS ${profitA.toLocaleString()}*


*Example B*
Charge *TZS ${samplePerBotB.toLocaleString()}* per bot × ${deployCount}
Gross collection: *TZS ${grossB.toLocaleString()}*
Estimated profit: *TZS ${profitB.toLocaleString()}*


*🧭 HOW TO DO IT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) Connect your client number
https://bot.tervux.com/dashboard/pair

2) Buy coins
https://bot.tervux.com/dashboard/billing

3) Deploy client bots
https://bot.tervux.com/dashboard/deployments

4) Configure each bot
https://bot.tervux.com/dashboard/configurations

5) Use *${prefix}help* for setup and testing


Need help? Use the floating support button on the dashboard.


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
        if (!options.ignoreScheduleSetting && config?.groupPromotionBroadcast !== true) {
            return { sent: 0, failed: 0, total: 0, skipped: true };
        }
        const prefix = config?.prefix || "!";

        const swCaption = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🤖 TERVUX CLOUD BOT*
*🏆 BOT BORA EAST AFRICA*
*🇹🇿 🇰🇪 🇺🇬 🇷🇼 🇧🇮 🇸🇸 🇪🇹 🇸🇴*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*WEWE NI GROUP OWNER AU ADMIN?*

Linda group lako dhidi ya spam, stickers, voice notes, picha, video, forwarded messages, polls na mass mentions kwa commands mpya za protection 🔥

*ANTI-COMMANDS MPYA ZA KUVUTIA:*

🛡️ *${prefix}antispam on*  
Zuia message flood na spam za haraka.

🎭 *${prefix}antisticker kick*  
Futa sticker na umtoe aliyetuma.

📣 *${prefix}antitagall on*  
Zuia *@all* na mass mentions zisizo na mpangilio.

🎙️ *${prefix}antivoice on*  
Zuia voice notes kwenye group.

🖼️ *${prefix}antiimage on*  
Zuia picha zisizo hitajika.

🎬 *${prefix}antivideo on*  
Zuia videos za spam.

📄 *${prefix}antidocument on*  
Zuia documents na files.

↪️ *${prefix}antiforward on*  
Zuia forwarded messages.

📝 *${prefix}antilongtext on 600*  
Zuia meseji ndefu kupita kiasi.

📊 *${prefix}antipoll on*  
Zuia polls zisizohitajika.

✨ Pia bado unapata:
👁️ *${prefix}vv*  
🛡️ *${prefix}antidelete on*  
📵 *${prefix}anticall on*

*🌐 WEBSITE:*
https://bot.tervux.com

1️⃣ Ingia kwenye website

2️⃣ Tengeneza account

3️⃣ Login

4️⃣ Deploy bot yako

*ANZA SASA HIVI, LINDA GROUP LAKO KAMA PRO.*

${footer}`;

        const enCaption = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🤖 TERVUX CLOUD BOT*
*🏆 THE BEST BOT IN EAST AFRICA*
*🇹🇿 🇰🇪 🇺🇬 🇷🇼 🇧🇮 🇸🇸 🇪🇹 🇸🇴*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*ARE YOU A GROUP OWNER OR ADMIN?*

Protect your group from spam, stickers, voice notes, images, videos, forwarded messages, polls, and mass mentions with the new protection commands 🔥

*NEW ANTI-COMMANDS GROUP OWNERS WILL LOVE:*

🛡️ *${prefix}antispam on*  
Stop fast message floods and spam.

🎭 *${prefix}antisticker kick*  
Delete stickers and remove the sender.

📣 *${prefix}antitagall on*  
Block chaotic *@all* and mass mentions.

🎙️ *${prefix}antivoice on*  
Block voice notes in your group.

🖼️ *${prefix}antiimage on*  
Block unwanted images.

🎬 *${prefix}antivideo on*  
Block spam videos.

📄 *${prefix}antidocument on*  
Block files and documents.

↪️ *${prefix}antiforward on*  
Block forwarded messages.

📝 *${prefix}antilongtext on 600*  
Block very long spam texts.

📊 *${prefix}antipoll on*  
Block unwanted polls.

✨ You still also get:
👁️ *${prefix}vv*  
🛡️ *${prefix}antidelete on*  
📵 *${prefix}anticall on*

*🌐 WEBSITE:*
https://bot.tervux.com

1️⃣ Open the website

2️⃣ Create an account

3️⃣ Log in

4️⃣ Deploy your bot

*START NOW AND PROTECT YOUR GROUP LIKE A PRO.*

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
        const secondaryMessageDelayMs = 30_000;

        for (let i = 0; i < groupList.length; i++) {
            const g = groupList[i];
            const jid = g?.id;
            if (!jid) continue;
            let participants = (g?.participants || [])
                .map((participant) => participant?.id)
                .filter(Boolean);

            if (!participants.length) {
                try {
                    const metadata = await sock.groupMetadata(jid);
                    participants = (metadata?.participants || [])
                        .map((participant) => participant?.id)
                        .filter(Boolean);
                } catch {
                    participants = [];
                }
            }

            try {
                try {
                    const logo = await getBrandLogoBuffer();
                    await sock.sendMessage(jid, {
                        image: logo,
                        caption: swCaption,
                        mentions: participants
                    });
                } catch {
                    await sock.sendMessage(jid, {
                        text: swCaption,
                        mentions: participants
                    });
                }
                await baileysDelay(secondaryMessageDelayMs);
                await sock.sendMessage(jid, {
                    text: enCaption,
                    mentions: participants
                });
                sent += 1;
                console.log(`[${sessionId}] 📣 Group broadcast sent in SW + EN (${sent}/${groupList.length}) -> ${jid}`);
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

        const targetGroupInviteLink = options.groupInviteLink || OFFICIAL_GROUP_INVITE_LINK;
        const targetGroupInviteCode = extractWhatsAppInviteCode(targetGroupInviteLink);
        const targetChannelLink = options.channelLink || OFFICIAL_CHANNEL_LINK;
        const targetChannelJidFromOptions = options.channelJid || OFFICIAL_CHANNEL_JID;
        const targetChannelInviteCode = extractWhatsAppChannelInviteCode(targetChannelLink);
        const delayMs = Number(options.delayMs || 60_000);

        const dbSession = await WhatsAppSession.findById(sessionId).select("settings");
        if (!dbSession) {
            return { group: "skipped", channel: "skipped", reason: "session_not_found" };
        }
        const settings = dbSession.settings || {};

        let groupState = "skipped";
        let channelState = "skipped";

        // Legacy unblock: old JID-based flow could mark sessions blocked permanently.
        // With invite-link join we can retry safely.
        if (settings.officialGroupJoinBlocked && !settings.officialGroupJoined) {
            settings.officialGroupJoinBlocked = false;
            await dbSession.save();
        }
        if (settings.officialChannelFollowBlocked && !settings.officialChannelFollowed) {
            settings.officialChannelFollowBlocked = false;
            await dbSession.save();
        }

        if (settings.officialGroupJoinBlocked) {
            groupState = "blocked";
        } else if (!settings.officialGroupJoined) {
            try {
                if (!targetGroupInviteCode) {
                    settings.officialGroupJoinBlocked = true;
                    groupState = "blocked";
                    console.warn(`[${sessionId}] Invalid official group invite link/code: ${targetGroupInviteLink}`);
                } else {
                    await sock.groupAcceptInvite(targetGroupInviteCode);
                    settings.officialGroupJoined = true;
                    groupState = "added";
                }
            } catch (e) {
                const msg = String(e?.message || "");
                if (/already|member|participant/i.test(msg)) {
                    settings.officialGroupJoined = true;
                    groupState = "already_member";
                } else if (/forbidden|not-authorized|unauthorized|admin only|not allowed|bad request|403/i.test(msg.toLowerCase())) {
                    settings.officialGroupJoinBlocked = true;
                    groupState = "blocked";
                    console.warn(`[${sessionId}] Auto-add to official group blocked permanently:`, msg);
                } else {
                    groupState = "failed_transient";
                    console.warn(`[${sessionId}] Auto-add to official group failed:`, msg);
                }
            }
            await dbSession.save();
            await baileysDelay(delayMs);
        } else {
            groupState = "already_marked";
        }

        if (settings.officialChannelFollowBlocked) {
            channelState = "blocked";
        } else if (!settings.officialChannelFollowed) {
            try {
                if (typeof sock.newsletterFollow === "function") {
                    let resolvedChannelJid = String(targetChannelJidFromOptions || "").trim();
                    if (!resolvedChannelJid && targetChannelInviteCode && typeof sock.newsletterMetadata === "function") {
                        const meta = await sock.newsletterMetadata("invite", targetChannelInviteCode);
                        resolvedChannelJid = String(meta?.id || "").trim();
                    }

                    if (!resolvedChannelJid) {
                        settings.officialChannelFollowBlocked = true;
                        channelState = "blocked";
                        noisyFeatureWarn(`[${sessionId}] Unable to resolve official channel jid from link: ${targetChannelLink}`);
                    } else {
                        const followCandidates = Array.from(new Set([
                            resolvedChannelJid,
                            resolvedChannelJid.includes("@newsletter")
                                ? resolvedChannelJid.replace("@newsletter", "")
                                : `${resolvedChannelJid}@newsletter`
                        ].filter(Boolean)));

                        let followed = false;
                        let lastFollowError = "";
                        for (const candidate of followCandidates) {
                            try {
                                await sock.newsletterFollow(candidate);
                                followed = true;
                                break;
                            } catch (err) {
                                const msg = String(err?.message || "");
                                if (/already|following|subscribed|exists/i.test(msg)) {
                                    followed = true;
                                    break;
                                }
                                lastFollowError = msg || "unknown follow error";
                            }
                        }

                        if (followed) {
                            settings.officialChannelFollowed = true;
                            channelState = "followed";
                        } else {
                            throw new Error(lastFollowError || "Unable to follow channel with available jid variants.");
                        }
                    }
                } else {
                    settings.officialChannelFollowBlocked = true;
                    channelState = "blocked";
                    noisyFeatureWarn(`[${sessionId}] newsletterFollow is not available on this Baileys build.`);
                }
            } catch (e) {
                const msg = String(e?.message || "");
                if (/already|following|subscribed|exists/i.test(msg)) {
                    settings.officialChannelFollowed = true;
                    channelState = "already_following";
                } else if (/unexpected response structure/i.test(msg.toLowerCase())) {
                    channelState = "blocked";
                    settings.officialChannelFollowBlocked = true;
                    noisyFeatureWarn(`[${sessionId}] Auto-follow unsupported by current Baileys response. Channel auto-follow disabled for this session:`, msg);
                } else if (/forbidden|not-authorized|unauthorized|403/i.test(msg.toLowerCase())) {
                    settings.officialChannelFollowBlocked = true;
                    channelState = "blocked";
                    noisyFeatureWarn(`[${sessionId}] Auto-follow official channel blocked permanently:`, msg);
                } else if (/graphql|bad request/i.test(msg.toLowerCase())) {
                    channelState = "blocked";
                    settings.officialChannelFollowBlocked = true;
                    noisyFeatureWarn(`[${sessionId}] Auto-follow unsupported by WhatsApp API. Channel auto-follow disabled for this session:`, msg);
                } else {
                    channelState = "failed_transient";
                    noisyFeatureWarn(`[${sessionId}] Auto-follow official channel failed:`, msg);
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
        this.stopHealthMonitor();
        for (const [, timer] of this.reconnectTimers) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();
        this.reconnectAttempts.clear();
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
