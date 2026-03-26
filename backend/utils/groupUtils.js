const metadataCache = new Map();
const GROUP_METADATA_CACHE_TTL_MS = Number(process.env.GROUP_METADATA_CACHE_TTL_MS || 30_000);
const TRACE_GROUP_PATH = process.env.WA_TRACE_GROUP_PATH === "true";
const SLOW_METADATA_WARN_MS = Number(process.env.WA_SLOW_METADATA_WARN_MS || 250);
const groupMetadataMetrics = {
    memoryHits: 0,
    networkFetches: 0,
    networkFailures: 0
};

const buildMetadataCacheKey = (sessionId, groupJid) => `group_metadata:${sessionId}:${groupJid}`;

const getFreshMetadata = (key) => {
    const entry = metadataCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > GROUP_METADATA_CACHE_TTL_MS) {
        metadataCache.delete(key);
        return null;
    }
    return entry.data;
};

const setFreshMetadata = (key, data) => {
    metadataCache.set(key, {
        data,
        timestamp: Date.now()
    });
    return data;
};

export function invalidateGroupMetadataCache(sessionId, groupJid) {
    if (!sessionId) return;
    if (groupJid) {
        metadataCache.delete(buildMetadataCacheKey(sessionId, groupJid));
        return;
    }
    const prefix = `group_metadata:${sessionId}:`;
    for (const key of metadataCache.keys()) {
        if (key.startsWith(prefix)) {
            metadataCache.delete(key);
        }
    }
}

/**
 * Helper: Get group metadata with short-lived cache.
 */
export async function getGroupMetadata(sock, groupJid, options = {}) {
    const sessionId = String(sock?.sessionId || "unknown");
    const cacheKey = buildMetadataCacheKey(sessionId, groupJid);
    const startedAt = Date.now();

    if (!options.forceRefresh) {
        const cached = getFreshMetadata(cacheKey);
        if (cached) {
            groupMetadataMetrics.memoryHits += 1;
            const meta = { source: "memory", elapsedMs: Date.now() - startedAt };
            return options.returnMeta ? { metadata: cached, meta } : cached;
        }
    }

    try {
        groupMetadataMetrics.networkFetches += 1;
        const metadata = await sock.groupMetadata(groupJid);
        if (!metadata) {
            console.error(`❌ [GroupMetadata] Received null/undefined for ${groupJid}`);
            const meta = { source: "network", elapsedMs: Date.now() - startedAt, found: false };
            return options.returnMeta ? { metadata: null, meta } : null;
        }
        const cached = setFreshMetadata(cacheKey, metadata);
        const meta = { source: "network", elapsedMs: Date.now() - startedAt, found: true };
        if (TRACE_GROUP_PATH && meta.elapsedMs >= SLOW_METADATA_WARN_MS) {
            console.warn(`🩺 [${sessionId}] Slow group metadata fetch for ${groupJid}: source=${meta.source} total=${meta.elapsedMs}ms`);
        }
        return options.returnMeta ? { metadata: cached, meta } : cached;
    } catch (e) {
        groupMetadataMetrics.networkFailures += 1;
        console.error(`❌ [GroupMetadata] Error fetching ${groupJid}:`, e.message);
        const meta = { source: "network", elapsedMs: Date.now() - startedAt, error: e.message };
        return options.returnMeta ? { metadata: null, meta } : null;
    }
}

const cleanJid = (jid) => (jid ? jid.split(":")[0].split("@")[0] : "");

export function getGroupMetadataMetrics() {
    return { ...groupMetadataMetrics };
}

export async function getGroupParticipantContext(sock, groupJid, userJid, options = {}) {
    const startedAt = Date.now();
    const metadataResult = await getGroupMetadata(sock, groupJid, options.returnMeta ? {
        forceRefresh: options.forceRefresh,
        returnMeta: true
    } : { forceRefresh: options.forceRefresh });
    const metadata = options.returnMeta ? metadataResult?.metadata : metadataResult;
    if (!metadata) {
        const fallback = {
            metadata: null,
            admins: [],
            senderIsAdmin: false,
            botIsAdmin: false
        };
        if (options.returnMeta) {
            return {
                context: fallback,
                meta: {
                    totalMs: Date.now() - startedAt,
                    metadataSource: metadataResult?.meta?.source || "unknown",
                    metadataMs: metadataResult?.meta?.elapsedMs || 0
                }
            };
        }
        return fallback;
    }

    const admins = metadata.participants
        .filter((participant) => participant.admin === "admin" || participant.admin === "superadmin")
        .map((participant) => participant.id);

    const targetClean = cleanJid(userJid);
    const botJid = sock.user?.id || "";
    const botLid = sock.user?.lid || "";
    const botCandidates = [cleanJid(botJid), cleanJid(botLid)].filter(Boolean);

    const senderIsAdmin = admins.includes(userJid) || admins.some((adminJid) => cleanJid(adminJid) === targetClean);
    const botIsAdmin = admins.some((adminJid) => {
        const normalized = cleanJid(adminJid);
        return botCandidates.includes(normalized);
    });

    const context = {
        metadata,
        admins,
        senderIsAdmin,
        botIsAdmin
    };
    if (options.returnMeta) {
        return {
            context,
            meta: {
                totalMs: Date.now() - startedAt,
                metadataSource: metadataResult?.meta?.source || "unknown",
                metadataMs: metadataResult?.meta?.elapsedMs || 0
            }
        };
    }
    return context;
}

/**
 * Helper: Check if user is group admin.
 */
export async function isAdmin(sock, groupJid, userJid) {
    try {
        const context = await getGroupParticipantContext(sock, groupJid, userJid);
        return context.senderIsAdmin;
    } catch (e) {
        console.error("❌ isAdmin Error:", e);
        return false;
    }
}

/**
 * Helper: Check if bot is group admin.
 */
export async function isBotAdmin(sock, groupJid) {
    try {
        const context = await getGroupParticipantContext(sock, groupJid, sock.user?.id || "");
        return context.botIsAdmin;
    } catch (e) {
        console.error("❌ isBotAdmin Error:", e);
        return false;
    }
}
