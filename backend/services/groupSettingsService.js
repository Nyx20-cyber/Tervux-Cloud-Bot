/**
 * Group Settings Storage - DB-backed with hot caches.
 */

import GroupSettings from "../models/GroupSettings.js";
import { delKey, getJson, setJson } from "../lib/redis.js";

const groupSettingsCache = new Map();
const GROUP_SETTINGS_CACHE_TTL_MS = Number(process.env.GROUP_SETTINGS_CACHE_TTL_MS || 30_000);
const GROUP_SETTINGS_REDIS_TTL_SECONDS = Number(process.env.GROUP_SETTINGS_CACHE_TTL_SECONDS || 30);
const TRACE_GROUP_PATH = process.env.WA_TRACE_GROUP_PATH === "true";
const SLOW_GROUP_PATH_WARN_MS = Number(process.env.WA_SLOW_GROUP_PATH_WARN_MS || 200);
const groupSettingsMetrics = {
    memoryHits: 0,
    redisHits: 0,
    dbHits: 0,
    dbMisses: 0
};

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source || {})) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

const DEFAULT_GROUP_SETTINGS = {
    welcome: {
        enabled: false,
        message: `╔══════════════════════════════════╗\n║  🎉 *𝕎𝔼𝕃ℂ𝕆𝕄𝔼* 🎉  ║\n╚══════════════════════════════════╝\n\nHey @user! 👋\n\nWelcome to *{group}*!\nYou are member *#{count}*.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📜 Please read the group rules\n💬 Introduce yourself\n🎉 Enjoy your stay!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    },
    goodbye: {
        enabled: false,
        message: `╔══════════════════════════════════╗\n║  👋 *𝔾𝕆𝕆𝔻𝔹𝕐𝔼* 👋  ║\n╚══════════════════════════════════╝\n\n@user has left the group.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nWe hope to see you again! 💫\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    },
    antilink: {
        enabled: false,
        action: "warn"
    },
    antisticker: {
        enabled: false,
        action: "warn"
    },
    antitagall: {
        enabled: false
    },
    botEnabled: true,
    antispam: {
        enabled: false,
        maxMessages: 5,
        timeWindow: 10
    },
    antimention: {
        enabled: false
    },
    antivoice: {
        enabled: false
    },
    antiimage: {
        enabled: false
    },
    antivideo: {
        enabled: false
    },
    antidocument: {
        enabled: false
    },
    antiforward: {
        enabled: false
    },
    antilongtext: {
        enabled: false,
        maxLength: 600
    },
    antipoll: {
        enabled: false
    },
    antifake: {
        enabled: false
    },
    autosticker: {
        enabled: false
    },
    badwords: [],
    groupAntiDelete: {
        enabled: false
    }
};

function deriveGroupFastPathProfile(settings = {}) {
    const hasGrouplock = Boolean(settings?.grouplock?.until && new Date(settings.grouplock.until) > new Date());
    const hasBadwords = Array.isArray(settings?.badwords) && settings.badwords.length > 0;
    const hasMessageRestriction = Boolean(
        hasGrouplock ||
        hasBadwords ||
        settings?.antilink?.enabled ||
        settings?.antispam?.enabled ||
        settings?.antilongtext?.enabled
    );
    const hasMediaRestriction = Boolean(
        settings?.antisticker?.enabled ||
        settings?.antivoice?.enabled ||
        settings?.antiimage?.enabled ||
        settings?.antivideo?.enabled ||
        settings?.antidocument?.enabled ||
        settings?.antipoll?.enabled ||
        settings?.autosticker?.enabled
    );
    const hasMentionRestriction = Boolean(settings?.antitagall?.enabled || settings?.antimention?.enabled);
    const hasForwardRestriction = Boolean(settings?.antiforward?.enabled);
    const hasModerationEnabled = Boolean(
        hasMessageRestriction ||
        hasMediaRestriction ||
        hasMentionRestriction ||
        hasForwardRestriction
    );

    return {
        hasMessageRestriction,
        hasMediaRestriction,
        hasMentionRestriction,
        hasForwardRestriction,
        hasModerationEnabled,
        hasGrouplock,
        hasBadwords,
        hasBotDisableGate: settings?.botEnabled === false
    };
}

function stripDerivedGroupSettings(value) {
    if (Array.isArray(value)) {
        return value.map(stripDerivedGroupSettings);
    }
    if (!value || typeof value !== "object") {
        return value;
    }

    const output = {};
    for (const [key, nextValue] of Object.entries(value)) {
        if (key.startsWith("__")) continue;
        output[key] = stripDerivedGroupSettings(nextValue);
    }
    return output;
}

const buildCacheKey = (sessionId, groupJid) => `group_settings:${sessionId}:${groupJid}`;

const getFreshCacheValue = (key) => {
    const entry = groupSettingsCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > GROUP_SETTINGS_CACHE_TTL_MS) {
        groupSettingsCache.delete(key);
        return null;
    }
    return entry.data;
};

const setFreshCacheValue = (key, data) => {
    groupSettingsCache.set(key, {
        data,
        timestamp: Date.now()
    });
    return data;
};

const normalizeGroupSettings = (doc, sessionId, groupJid) => {
    const normalized = deepMerge(DEFAULT_GROUP_SETTINGS, {
        sessionId,
        groupJid,
        ...(doc?.toObject?.() || doc || {})
    });
    normalized.__fastPathProfile = deriveGroupFastPathProfile(normalized);
    return normalized;
};

export async function invalidateGroupSettingsCache(sessionId, groupJid) {
    if (!sessionId || !groupJid) return;
    const key = buildCacheKey(sessionId, groupJid);
    groupSettingsCache.delete(key);
    await delKey(key);
}

export async function primeGroupSettingsCache(sessionId, groupJid, settings) {
    if (!sessionId || !groupJid) return null;
    const key = buildCacheKey(sessionId, groupJid);
    const normalized = normalizeGroupSettings(settings, sessionId, groupJid);
    setFreshCacheValue(key, normalized);
    await setJson(key, normalized, GROUP_SETTINGS_REDIS_TTL_SECONDS);
    return normalized;
}

export function getGroupSettingsMetrics() {
    return { ...groupSettingsMetrics };
}

export async function loadGroupSettings(sessionId, groupJid, options = {}) {
    if (!sessionId) {
        console.error("❌ Need sessionId in loadGroupSettings");
        const fallback = normalizeGroupSettings(null, sessionId, groupJid);
        return options.returnMeta ? { settings: fallback, meta: { source: "fallback", elapsedMs: 0 } } : fallback;
    }

    const startedAt = Date.now();
    const key = buildCacheKey(sessionId, groupJid);
    const memoryValue = getFreshCacheValue(key);
    if (memoryValue) {
        groupSettingsMetrics.memoryHits += 1;
        const meta = { source: "memory", elapsedMs: Date.now() - startedAt };
        return options.returnMeta ? { settings: memoryValue, meta } : memoryValue;
    }

    const redisValue = await getJson(key);
    if (redisValue) {
        groupSettingsMetrics.redisHits += 1;
        const normalized = setFreshCacheValue(key, normalizeGroupSettings(redisValue, sessionId, groupJid));
        const meta = { source: "redis", elapsedMs: Date.now() - startedAt };
        return options.returnMeta ? { settings: normalized, meta } : normalized;
    }

    try {
        const doc = await GroupSettings.findOne({ sessionId, groupJid });
        groupSettingsMetrics.dbHits += 1;
        if (!doc) {
            groupSettingsMetrics.dbMisses += 1;
        }
        const normalized = normalizeGroupSettings(doc, sessionId, groupJid);
        await primeGroupSettingsCache(sessionId, groupJid, normalized);
        const meta = {
            source: "db",
            elapsedMs: Date.now() - startedAt,
            found: Boolean(doc)
        };
        if (TRACE_GROUP_PATH && meta.elapsedMs >= SLOW_GROUP_PATH_WARN_MS) {
            console.warn(`🩺 [${sessionId}] Slow group settings load for ${groupJid}: source=${meta.source} total=${meta.elapsedMs}ms`);
        }
        return options.returnMeta ? { settings: normalized, meta } : normalized;
    } catch (err) {
        console.error(`❌ Failed to load group settings for ${groupJid}:`, err.message);
        const fallback = normalizeGroupSettings(null, sessionId, groupJid);
        const meta = { source: "fallback", elapsedMs: Date.now() - startedAt, error: err.message };
        return options.returnMeta ? { settings: fallback, meta } : fallback;
    }
}

export async function saveGroupSettings(sessionId, groupJid, settings) {
    if (!sessionId) return false;
    try {
        const sanitized = stripDerivedGroupSettings(settings);
        await GroupSettings.updateOne(
            { sessionId, groupJid },
            { $set: sanitized },
            { upsert: true }
        );
        await primeGroupSettingsCache(sessionId, groupJid, sanitized);
        return true;
    } catch (err) {
        console.error(`❌ Failed to save group settings for ${groupJid}:`, err.message);
        return false;
    }
}

export async function updateGroupSettings(sessionId, groupJid, updates) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    const newSettings = deepMerge(settings, updates);
    return await saveGroupSettings(sessionId, groupJid, newSettings);
}

export async function getWelcomeMessage(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.welcome;
}

export async function getGoodbyeMessage(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.goodbye;
}

export async function saveInviteCode(sessionId, groupJid, code) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    settings.inviteCode = code;
    settings.lastKnownName = settings.lastKnownName || "Unknown Group";
    settings.leftAt = new Date();
    return await saveGroupSettings(sessionId, groupJid, settings);
}

export async function getInviteCode(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.inviteCode;
}

export async function updateGroupName(sessionId, groupJid, name) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    settings.lastKnownName = name;
    return await saveGroupSettings(sessionId, groupJid, settings);
}

export async function getGroupsWithInviteCodes(sessionId) {
    if (!sessionId) return [];
    try {
        return await GroupSettings.find({
            sessionId,
            inviteCode: { $exists: true, $ne: "" }
        });
    } catch {
        return [];
    }
}
