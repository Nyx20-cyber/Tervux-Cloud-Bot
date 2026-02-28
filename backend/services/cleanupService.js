import WhatsAppSession from "../models/WhatsAppSession.js";
import User from "../models/User.js";
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
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
        await cleanOrphanedDirs();
        console.log("✅ [Cleanup] Maintenance cycle complete.");
    } catch (error) {
        console.error("❌ [Cleanup] Maintenance failed:", error.message);
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
        await sessionManager.destroySession(ghost._id.toString(), ghost.authDir);
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
        if (session.authDir && existsSync(session.authDir)) {
            try {
                rmSync(session.authDir, { recursive: true, force: true });
            } catch (e) {
                console.error(`   Failed to delete auth dir:`, e.message);
            }
        }
        await WhatsAppSession.deleteOne({ _id: session._id });
    }

    if (stale.length > 0) {
        console.log(`   🧹 Cleaned ${stale.length} stale session(s).`);
    }
}

/**
 * Orphaned auth directories: exist on disk but no DB record
 */
async function cleanOrphanedDirs() {
    const authSessionsDir = join(process.cwd(), "auth_sessions");
    if (!existsSync(authSessionsDir)) return;

    try {
        const dirs = readdirSync(authSessionsDir);
        let deletedCount = 0;

        for (const dir of dirs) {
            const fullPath = join(authSessionsDir, dir);

            // Check if any session in DB references this path
            const session = await WhatsAppSession.findOne({ authDir: fullPath });
            if (!session) {
                console.log(`   🗂️ [Orphan] Deleting orphaned dir: ${dir}`);
                try {
                    rmSync(fullPath, { recursive: true, force: true });
                    deletedCount++;
                } catch (e) {
                    console.error(`   Failed to delete orphan:`, e.message);
                }
            }
        }

        if (deletedCount > 0) {
            console.log(`   🧹 Deleted ${deletedCount} orphaned director(ies).`);
        }
    } catch (error) {
        console.error("   Orphan cleanup error:", error.message);
    }
}

// Also clean legacy sessions/ directory
export function cleanLegacySessions() {
    const sessionsDir = join(process.cwd(), "sessions");
    if (!existsSync(sessionsDir)) return;

    try {
        const files = readdirSync(sessionsDir);
        let deletedCount = 0;

        files.forEach((file) => {
            if (!file.startsWith("Tervux-")) return;
            const filePath = join(sessionsDir, file);
            try {
                rmSync(filePath, { recursive: true, force: true });
                deletedCount++;
            } catch (err) { }
        });

        if (deletedCount > 0) {
            console.log(`🧹 [Legacy] Cleaned ${deletedCount} old session folder(s).`);
        }
    } catch (error) { }
}
