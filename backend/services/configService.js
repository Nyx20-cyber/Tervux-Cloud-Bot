import WhatsAppSession from "../models/WhatsAppSession.js";
import { join } from "path";
import { delKey, getJson, setJson } from "../lib/redis.js";

/**
 * Per-User Config Service (DB-backed)
 * Replaces the old config.json file-based approach
 */

// In-memory cache keyed by sessionId
const configCache = new Map();
const CACHE_TTL = 5000;
const REDIS_CACHE_TTL_SECONDS = Number(process.env.SESSION_CONFIG_CACHE_TTL_SECONDS || 30);
const getRedisConfigKey = (sessionId) => `session_config:${sessionId}`;

/**
 * Default session settings
 */
export const DEFAULT_SETTINGS = {
    prefix: "!",
    alwaysOnline: false,
    autoLikeStatus: false,
    autoViewStatus: false,
    antiDelete: false,
    antiCall: false,
    antiViewOnce: false,
    antiRemove: false,
    autoReadMessages: false,
    alwaysTyping: false,
    alwaysRecording: false
};

/**
 * Get cached config for a specific session
 */
export async function getCachedConfig(sessionId) {
    if (!sessionId) return { ...DEFAULT_SETTINGS };

    const now = Date.now();
    const cached = configCache.get(sessionId);

    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    const redisKey = getRedisConfigKey(sessionId);
    const redisCached = await getJson(redisKey);
    if (redisCached) {
        configCache.set(sessionId, { data: redisCached, timestamp: now });
        return redisCached;
    }

    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return { ...DEFAULT_SETTINGS };

    const config = {
        phone: session.phone,
        name: session.name,
        ownerNumber: session.phone,
        ...DEFAULT_SETTINGS,
        ...session.settings?.toObject?.() || session.settings || {}
    };

    configCache.set(sessionId, { data: config, timestamp: now });
    await setJson(redisKey, config, REDIS_CACHE_TTL_SECONDS);
    return config;
}

/**
 * Update config for a specific session
 */
export async function updateConfig(sessionId, updates) {
    const setUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
        if (key in DEFAULT_SETTINGS) {
            setUpdates[`settings.${key}`] = value;
        } else if (key === "phone" || key === "name") {
            setUpdates[key] = value;
        }
    }

    await WhatsAppSession.findByIdAndUpdate(sessionId, { $set: setUpdates });
    await invalidateConfigCache(sessionId);
}

/**
 * Invalidate config cache for a session
 */
export async function invalidateConfigCache(sessionId) {
    if (sessionId) {
        configCache.delete(sessionId);
        await delKey(getRedisConfigKey(sessionId));
    } else {
        configCache.clear();
    }
}

// Legacy flat-file authentication removed. Database-only auth activated.
