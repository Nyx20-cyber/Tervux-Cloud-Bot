/**
 * Group Settings Storage - DB-backed with hot caches.
 */

import GroupSettings from "../models/GroupSettings.js";
import { delKey, getJson, setJson } from "../lib/redis.js";

const groupSettingsCache = new Map();
const GROUP_SETTINGS_CACHE_TTL_MS = Number(process.env.GROUP_SETTINGS_CACHE_TTL_MS || 30_000);
const GROUP_SETTINGS_REDIS_TTL_SECONDS = Number(process.env.GROUP_SETTINGS_CACHE_TTL_SECONDS || 30);

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
    botEnabled: true,
    antispam: {
        enabled: false,
        maxMessages: 5,
        timeWindow: 10
    },
    groupAntiDelete: {
        enabled: false
    }
};

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

const normalizeGroupSettings = (doc, sessionId, groupJid) => deepMerge(DEFAULT_GROUP_SETTINGS, {
    sessionId,
    groupJid,
    ...(doc?.toObject?.() || doc || {})
});

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

export async function loadGroupSettings(sessionId, groupJid) {
    if (!sessionId) {
        console.error("❌ Need sessionId in loadGroupSettings");
        return deepMerge({}, DEFAULT_GROUP_SETTINGS);
    }

    const key = buildCacheKey(sessionId, groupJid);
    const memoryValue = getFreshCacheValue(key);
    if (memoryValue) {
        return memoryValue;
    }

    const redisValue = await getJson(key);
    if (redisValue) {
        return setFreshCacheValue(key, normalizeGroupSettings(redisValue, sessionId, groupJid));
    }

    try {
        const doc = await GroupSettings.findOne({ sessionId, groupJid });
        const normalized = normalizeGroupSettings(doc, sessionId, groupJid);
        await primeGroupSettingsCache(sessionId, groupJid, normalized);
        return normalized;
    } catch (err) {
        console.error(`❌ Failed to load group settings for ${groupJid}:`, err.message);
        return normalizeGroupSettings(null, sessionId, groupJid);
    }
}

export async function saveGroupSettings(sessionId, groupJid, settings) {
    if (!sessionId) return false;
    try {
        await GroupSettings.updateOne(
            { sessionId, groupJid },
            { $set: settings },
            { upsert: true }
        );
        await primeGroupSettingsCache(sessionId, groupJid, settings);
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
