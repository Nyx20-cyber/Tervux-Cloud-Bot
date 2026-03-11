import WhatsAppSession from "../models/WhatsAppSession.js";
import User from "../models/User.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import { sessionManager } from "./whatsappService.js";
import { emitToUser, emitUpdate } from "./socketService.js";

/**
 * Comprehensive cleanup service for multi-tenant sessions
 * Handles ghost sessions, expired deployments, stale sessions, and orphaned files
 */

/**
 * Run all cleanup tasks
 */
export async function runCleanup() {
    console.log("🧹 [Cleanup] Starting maintenance cycle...");

    try {
        await healUnresponsiveLiveSessions();
        await cleanGhostSessions();
        await cleanUndeployedSessions();
        await cleanStaleDisconnected();
        await cleanOrphanedMongoAuth();
        await cleanExpiredBots();
        console.log("✅ [Cleanup] Maintenance cycle complete.");
    } catch (error) {
        console.error("❌ [Cleanup] Maintenance failed:", error.message);
    }
}

/**
 * Undeployed linked sessions:
 * If a session has no deployment (expiresAt = null) for over 24 hours, remove it automatically.
 */
async function cleanUndeployedSessions() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleUndeployed = await WhatsAppSession.find({
        expiresAt: null,
        status: { $in: ["active", "paused", "disconnected"] },
        createdAt: { $lt: cutoff }
    }).select("_id userId status createdAt");

    let removed = 0;
    for (const session of staleUndeployed) {
        const sessionId = session._id.toString();
        const userId = session.userId?.toString?.() || String(session.userId);
        const hasAuth = await WhatsAppAuth.exists({ sessionId, type: "creds" });

        try {
            if (hasAuth && !sessionManager.isConnected(sessionId)) {
                await sessionManager.connectSession(sessionId);
            }
            await sessionManager.sendUndeployedSessionRemovalMessage(sessionId, { removedAt: new Date() });
            await new Promise((r) => setTimeout(r, 1200));
        } catch (e) {
            console.warn(`   ⚠️ [Undeployed] Failed to send removal notice for ${sessionId}:`, e.message);
        }

        try {
            await sessionManager.destroySession(sessionId);
        } catch (e) {
            console.warn(`   ⚠️ [Undeployed] Failed to destroy runtime session ${sessionId}:`, e.message);
        }

        try {
            await WhatsAppAuth.deleteMany({ sessionId });
        } catch (e) {
            console.warn(`   ⚠️ [Undeployed] Failed to delete auth for ${sessionId}:`, e.message);
        }

        await WhatsAppSession.deleteOne({ _id: session._id });
        emitToUser(userId, "session_deleted", {
            sessionId,
            reason: "undeployed_timeout"
        });
        emitUpdate("admin_session_deleted", {
            sessionId,
            reason: "undeployed_timeout"
        });
        removed += 1;
    }

    if (removed > 0) {
        console.log(`   🧹 [Undeployed] Removed ${removed} undeployed session(s) older than 24h.`);
    }
}

/**
 * Self-heal runtime/live mismatch:
 * If session is marked active/paused/disconnected (and not expired) but socket is not live,
 * try reconnecting automatically.
 */
async function healUnresponsiveLiveSessions() {
    const now = new Date();
    const candidates = await WhatsAppSession.find({
        status: { $in: ["active", "paused"] },
        expiresAt: { $gt: now }
    }).select("_id status expiresAt lastConnected");

    let healed = 0;
    for (const session of candidates) {
        const sid = session._id.toString();
        const runtime = sessionManager.getRuntimeState(sid);
        if (runtime.isConnected || runtime.isConnecting || runtime.reconnectScheduled) continue;

        // If runtime still has a socket entry that is not explicitly closed,
        // avoid forcing a second reconnect from cleanup.
        if (runtime.hasEntry && runtime.connectionState !== "closed") continue;

        const lastConnectedMs = session.lastConnected ? new Date(session.lastConnected).getTime() : 0;
        const connectedRecently = lastConnectedMs > 0 && (Date.now() - lastConnectedMs) < 2 * 60 * 1000;
        if (connectedRecently) continue;

        const hasAuth = await WhatsAppAuth.exists({ sessionId: sid, type: "creds" });
        if (!hasAuth) continue;

        try {
            console.log(`   🩺 [Heal] Reconnecting stale session ${sid} (${session.status})...`);
            await sessionManager.connectSession(sid);
            healed++;
        } catch (error) {
            console.warn(`   ⚠️ [Heal] Reconnect failed for ${sid}: ${error.message}`);
        }
    }

    if (healed > 0) {
        console.log(`   ✅ [Heal] Reconnected ${healed} stale session(s).`);
    }
}

/**
 * Expired bots: Deletes sessions that have passed their 30-day deployment timestamp.
 */
async function cleanExpiredBots() {
    const now = new Date();

    const expiredSessions = await WhatsAppSession.find({
        expiresAt: { $lt: now, $ne: null },
        status: { $in: ["active", "paused", "disconnected", "expired"] }
    });

    for (const session of expiredSessions) {
        console.log(`   ⏳ [Expired] Auto-deleting expired 30-day session ${session._id} (${session.phone || "unknown"})`);
        const sessionId = session._id.toString();
        const userId = session.userId?.toString?.() || String(session.userId);
        const hasAuth = await WhatsAppAuth.exists({ sessionId, type: "creds" });

        // Best effort: send final expiry message before session shutdown/deletion.
        try {
            if (hasAuth && !sessionManager.isConnected(sessionId)) {
                await sessionManager.connectSession(sessionId);
            }
            await sessionManager.sendDeploymentExpiredMessage(sessionId, { expiredAt: session.expiresAt });
            await new Promise((r) => setTimeout(r, 1200));
        } catch (e) {
            console.warn(`   ⚠️ [Expired] Failed to send final expiry message for ${sessionId}:`, e.message);
        }

        try {
            await sessionManager.destroySession(sessionId);
        } catch (e) {
            console.error(`   Failed to destroy session manager instance:`, e.message);
        }

        try {
            await WhatsAppAuth.deleteMany({ sessionId });
        } catch (e) {
            console.error(`   Failed to delete auth records:`, e.message);
        }

        await WhatsAppSession.deleteOne({ _id: session._id });
        emitToUser(userId, "session_deleted", {
            sessionId,
            reason: "expired"
        });
        emitUpdate("admin_session_deleted", {
            sessionId,
            reason: "expired"
        });
    }

    if (expiredSessions.length > 0) {
        console.log(`   🧹 Cleaned ${expiredSessions.length} expired 30-day session(s).`);
    }
}


/**
 * Ghost sessions: stuck in "pairing" status for > 3 minutes
 */
async function cleanGhostSessions() {
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);

    const ghosts = await WhatsAppSession.find({
        status: "pairing",
        pairingStartedAt: { $lt: threeMinAgo }
    });

    for (const ghost of ghosts) {
        console.log(`   👻 [Ghost] Cleaning pairing session ${ghost._id} (${ghost.phone || "unknown"})`);
        await sessionManager.destroySession(ghost._id.toString());
        await WhatsAppAuth.deleteMany({ sessionId: ghost._id.toString() });
        await WhatsAppSession.deleteOne({ _id: ghost._id });
    }

    if (ghosts.length > 0) {
        console.log(`   🧹 Cleaned ${ghosts.length} ghost session(s).`);
    }
}

/**
 * Stale disconnected: sessions disconnected for > 7 days → clean up files
 */
async function cleanStaleDisconnected() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stale = await WhatsAppSession.find({
        status: { $in: ["disconnected", "expired"] },
        updatedAt: { $lt: sevenDaysAgo }
    });

    for (const session of stale) {
        console.log(`   🗑️ [Stale] Cleaning up session ${session._id}`);
        try {
            await WhatsAppAuth.deleteMany({ sessionId: session._id.toString() });
        } catch (e) {
            console.error(`   Failed to delete auth records:`, e.message);
        }
        await WhatsAppSession.deleteOne({ _id: session._id });
    }

    if (stale.length > 0) {
        console.log(`   🧹 Cleaned ${stale.length} stale session(s).`);
    }
}

/**
 * Orphaned Mongo Auth docs: exist in WhatsAppAuth but no WhatsAppSession record
 */
async function cleanOrphanedMongoAuth() {
    try {
        const { Types } = await import("mongoose");

        // Find all unique sessionIds currently in the auth collection
        const authSessionIds = await WhatsAppAuth.distinct("sessionId");
        let deletedCount = 0;

        for (const authId of authSessionIds) {
            // If sessionId is not a valid ObjectId, it's definitely orphaned
            if (!Types.ObjectId.isValid(authId)) {
                console.log(`   🗂️ [Orphan] Deleting invalid auth records for session: ${authId}`);
                await WhatsAppAuth.deleteMany({ sessionId: authId });
                deletedCount++;
                continue;
            }

            const sessionExists = await WhatsAppSession.exists({ _id: authId });
            if (!sessionExists) {
                console.log(`   🗂️ [Orphan] Deleting orphaned auth records for session: ${authId}`);
                try {
                    await WhatsAppAuth.deleteMany({ sessionId: authId });
                    deletedCount++;
                } catch (e) {
                    console.error(`   Failed to delete orphan:`, e.message);
                }
            }
        }

        if (deletedCount > 0) {
            console.log(`   🧹 Deleted orphaned auth records for ${deletedCount} session(s).`);
        }
    } catch (error) {
        console.error("   Orphan cleanup error:", error.message);
    }
}
