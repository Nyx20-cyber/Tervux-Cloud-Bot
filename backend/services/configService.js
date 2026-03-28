import WhatsAppSession from "../models/WhatsAppSession.js";
import { delKey, getJson, setJson } from "../lib/redis.js";

/**
 * Session config/runtime cache service.
 * L1 = in-process memory, L2 = Redis, L3 = Mongo fallback.
 */

const configCache = new Map();
const runtimeCache = new Map();

const CONFIG_CACHE_TTL_MS = Number(process.env.SESSION_CONFIG_CACHE_TTL_MS || 30_000);
const RUNTIME_CACHE_TTL_MS = Number(process.env.SESSION_RUNTIME_CACHE_TTL_MS || 30_000);
const REDIS_CONFIG_TTL_SECONDS = Number(process.env.SESSION_CONFIG_CACHE_TTL_SECONDS || 30);
const REDIS_RUNTIME_TTL_SECONDS = Number(process.env.SESSION_RUNTIME_CACHE_TTL_SECONDS || 30);

const getRedisConfigKey = (sessionId) => `session_config:${sessionId}`;
const getRedisRuntimeKey = (sessionId) => `session_runtime:${sessionId}`;

export const DEFAULT_SETTINGS = {
    prefix: ".",
    alwaysOnline: false,
    autoLikeStatus: true,
    autoViewStatus: false,
    antiDelete: false,
    antiCall: false,
    antiViewOnce: false,
    antiRemove: false,
    autoReadMessages: false,
    alwaysTyping: false,
    alwaysRecording: false,
    groupPromotionBroadcast: false
};

const getFreshCacheValue = (cache, key, ttlMs) => {
    const entry = cache.get(String(key));
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(String(key));
        return null;
    }
    return entry.data;
};

const setFreshCacheValue = (cache, key, data) => {
    cache.set(String(key), {
        data,
        timestamp: Date.now()
    });
    return data;
};

const buildConfigFromSession = (session) => ({
    phone: session?.phone || "",
    name: session?.name || "Bot User",
    ownerNumber: session?.phone || "",
    ...DEFAULT_SETTINGS,
    ...(session?.settings?.toObject?.() || session?.settings || {})
});

const buildRuntimeFromSession = (session) => {
    const expiresAt = session?.expiresAt || null;
    const status = session?.status || "disconnected";
    const settings = session?.settings?.toObject?.() || session?.settings || {};
    const prefix = settings.prefix || DEFAULT_SETTINGS.prefix;
    const groupPromotionBroadcast = settings.groupPromotionBroadcast === true;
    const autoReconnectDisabled = session?.autoReconnectDisabled === true;

    return {
        sessionId: session?._id?.toString?.() || "",
        status,
        expiresAt,
        isPaused: status === "paused",
        isDeployed: !!(expiresAt && new Date(expiresAt) > new Date()),
        autoReconnectDisabled,
        disconnectIntent: session?.disconnectIntent || "none",
        lastDisconnectedAt: session?.lastDisconnectedAt || null,
        prefix,
        phone: session?.phone || "",
        name: session?.name || "Bot User",
        ownerNumber: session?.phone || "",
        groupPromotionBroadcast,
        updatedAt: new Date().toISOString()
    };
};

const writeSessionCaches = async (sessionId, config, runtime) => {
    const sid = String(sessionId);
    setFreshCacheValue(configCache, sid, config);
    setFreshCacheValue(runtimeCache, sid, runtime);
    await Promise.all([
        setJson(getRedisConfigKey(sid), config, REDIS_CONFIG_TTL_SECONDS),
        setJson(getRedisRuntimeKey(sid), runtime, REDIS_RUNTIME_TTL_SECONDS)
    ]);
};

export async function primeSessionCachesFromDocument(session) {
    if (!session?._id) return null;
    const sid = session._id.toString();
    const config = buildConfigFromSession(session);
    const runtime = buildRuntimeFromSession(session);
    await writeSessionCaches(sid, config, runtime);
    return { config, runtime };
}

export async function getCachedConfig(sessionId, options = {}) {
    if (!sessionId) return { ...DEFAULT_SETTINGS };

    const sid = String(sessionId);
    const memoryConfig = getFreshCacheValue(configCache, sid, CONFIG_CACHE_TTL_MS);
    if (memoryConfig) {
        return memoryConfig;
    }

    const redisConfig = await getJson(getRedisConfigKey(sid));
    if (redisConfig) {
        return setFreshCacheValue(configCache, sid, redisConfig);
    }

    if (options.allowDbFallback === false) {
        return null;
    }

    const session = await WhatsAppSession.findById(sid).select("phone name settings status expiresAt autoReconnectDisabled disconnectIntent lastDisconnectedAt");
    if (!session) return { ...DEFAULT_SETTINGS };

    const { config } = (await primeSessionCachesFromDocument(session)) || {
        config: buildConfigFromSession(session)
    };
    return config;
}

export async function getCachedRuntimeSnapshot(sessionId, options = {}) {
    if (!sessionId) return null;

    const sid = String(sessionId);
    const memoryRuntime = getFreshCacheValue(runtimeCache, sid, RUNTIME_CACHE_TTL_MS);
    if (memoryRuntime) {
        return memoryRuntime;
    }

    const redisRuntime = await getJson(getRedisRuntimeKey(sid));
    if (redisRuntime) {
        return setFreshCacheValue(runtimeCache, sid, redisRuntime);
    }

    if (options.allowDbFallback === false) {
        return null;
    }

    const session = await WhatsAppSession.findById(sid).select("phone name settings status expiresAt autoReconnectDisabled disconnectIntent lastDisconnectedAt");
    if (!session) return null;

    const { runtime } = (await primeSessionCachesFromDocument(session)) || {
        runtime: buildRuntimeFromSession(session)
    };
    return runtime;
}

export async function mergeCachedRuntimeSnapshot(sessionId, partialRuntime = {}) {
    if (!sessionId) return null;
    const sid = String(sessionId);
    const current = (await getCachedRuntimeSnapshot(sid, { allowDbFallback: false })) || null;
    if (!current) return null;

    const next = {
        ...current,
        ...partialRuntime,
        updatedAt: new Date().toISOString()
    };

    setFreshCacheValue(runtimeCache, sid, next);
    await setJson(getRedisRuntimeKey(sid), next, REDIS_RUNTIME_TTL_SECONDS);
    return next;
}

export async function updateConfig(sessionId, updates) {
    const sid = String(sessionId);
    const setUpdates = {};
    for (const [key, value] of Object.entries(updates || {})) {
        if (key in DEFAULT_SETTINGS) {
            setUpdates[`settings.${key}`] = value;
        } else if (key === "phone" || key === "name") {
            setUpdates[key] = value;
        }
    }

    const updatedSession = await WhatsAppSession.findByIdAndUpdate(
        sid,
        { $set: setUpdates },
        {
            returnDocument: "after",
            select: "phone name settings status expiresAt autoReconnectDisabled disconnectIntent lastDisconnectedAt"
        }
    );

    if (!updatedSession) {
        await invalidateSessionCaches(sid);
        return null;
    }

    await primeSessionCachesFromDocument(updatedSession);
    return updatedSession;
}

export async function invalidateConfigCache(sessionId) {
    if (!sessionId) {
        configCache.clear();
        return;
    }
    const sid = String(sessionId);
    configCache.delete(sid);
    await delKey(getRedisConfigKey(sid));
}

export async function invalidateRuntimeSnapshot(sessionId) {
    if (!sessionId) {
        runtimeCache.clear();
        return;
    }
    const sid = String(sessionId);
    runtimeCache.delete(sid);
    await delKey(getRedisRuntimeKey(sid));
}

export async function invalidateSessionCaches(sessionId) {
    if (!sessionId) {
        configCache.clear();
        runtimeCache.clear();
        await Promise.all([
            delKey("session_config:*"),
            delKey("session_runtime:*")
        ]);
        return;
    }

    await Promise.all([
        invalidateConfigCache(sessionId),
        invalidateRuntimeSnapshot(sessionId)
    ]);
}
