const metadataCache = new Map();
const GROUP_METADATA_CACHE_TTL_MS = Number(process.env.GROUP_METADATA_CACHE_TTL_MS || 30_000);

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

    if (!options.forceRefresh) {
        const cached = getFreshMetadata(cacheKey);
        if (cached) {
            return cached;
        }
    }

    try {
        const metadata = await sock.groupMetadata(groupJid);
        if (!metadata) {
            console.error(`❌ [GroupMetadata] Received null/undefined for ${groupJid}`);
            return null;
        }
        return setFreshMetadata(cacheKey, metadata);
    } catch (e) {
        console.error(`❌ [GroupMetadata] Error fetching ${groupJid}:`, e.message);
        return null;
    }
}

const cleanJid = (jid) => (jid ? jid.split(":")[0].split("@")[0] : "");

export async function getGroupParticipantContext(sock, groupJid, userJid) {
    const metadata = await getGroupMetadata(sock, groupJid);
    if (!metadata) {
        return {
            metadata: null,
            admins: [],
            senderIsAdmin: false,
            botIsAdmin: false
        };
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

    return {
        metadata,
        admins,
        senderIsAdmin,
        botIsAdmin
    };
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
