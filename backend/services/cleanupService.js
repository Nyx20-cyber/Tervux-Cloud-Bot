import WhatsAppSession from "../models/WhatsAppSession.js";
import User from "../models/User.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import { sessionManager } from "./whatsappService.js";

/**
 * Comprehensive cleanup service for multi-tenant sessions
 * Handles ghost sessions, expired subscriptions, stale sessions, and orphaned files
 */

/**
 * Run all cleanup tasks
 */
export async function runCleanup() {
    console.log("🧹 [Cleanup] Starting maintenance cycle...");

    try {
        await cleanGhostSessions();
        await cleanExpiredSubscriptions();
        await cleanStaleDisconnected();
        await cleanOrphanedMongoAuth();
        await cleanUnpaidSessions();
        console.log("✅ [Cleanup] Maintenance cycle complete.");
    } catch (error) {
        console.error("❌ [Cleanup] Maintenance failed:", error.message);
    }
}

/**
 * Unpaid sessions: sessions created > 24 hours ago with no active subscription
 */
async function cleanUnpaidSessions() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unpaidSessions = await WhatsAppSession.find({
        createdAt: { $lt: twentyFourHoursAgo },
        "subscription.status": { $ne: "active" }
    });

    for (const session of unpaidSessions) {
        console.log(`   ⏳ [Unpaid] Deleting unpaid session ${session._id} (${session.phone || "unknown"})`);
        await sessionManager.destroySession(session._id.toString());
        await WhatsAppSession.deleteOne({ _id: session._id });
    }

    if (unpaidSessions.length > 0) {
        console.log(`   🧹 Cleaned ${unpaidSessions.length} unpaid session(s).`);
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
        await WhatsAppSession.deleteOne({ _id: ghost._id });
    }

    if (ghosts.length > 0) {
        console.log(`   🧹 Cleaned ${ghosts.length} ghost session(s).`);
    }
}

/**
 * Expired subscriptions: disconnect their active sessions
 */
async function cleanExpiredSubscriptions() {
    const expiredSessions = await WhatsAppSession.find({
        "subscription.status": "active",
        "subscription.expiresAt": { $lt: new Date() }
    });

    for (const session of expiredSessions) {
        console.log(`   ⏰ [Expired] Session ${session._id} subscription expired.`);

        // Update session subscription status
        session.subscription.status = "expired";
        session.status = "expired";
        await session.save();

        console.log(`   🔌 [Expired] Disconnecting session ${session._id}`);
        await sessionManager.disconnectSession(session._id.toString());
    }

    if (expiredSessions.length > 0) {
        console.log(`   🧹 Expired ${expiredSessions.length} session subscription(s).`);
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
            await WhatsAppAuth.deleteMany({ sessionId: session._id });
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
        // Find all unique sessionIds currently in the auth collection
        const authSessionIds = await WhatsAppAuth.distinct("sessionId");
        let deletedCount = 0;

        for (const authId of authSessionIds) {
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
