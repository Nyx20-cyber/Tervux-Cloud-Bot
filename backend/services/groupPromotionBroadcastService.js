import WhatsAppSession from "../models/WhatsAppSession.js";
import { sessionManager } from "./whatsappService.js";

let isRunning = false;

/**
 * Daily midnight promotion broadcast to all groups of each deployed session.
 * Includes a 1-minute delay per group to reduce spam risk on client numbers.
 */
export async function runGroupPromotionBroadcast() {
    if (isRunning) {
        console.log("📣 [GroupBroadcast] Previous cycle still running; skipping this schedule.");
        return;
    }
    isRunning = true;

    try {
        const now = new Date();
        const sessions = await WhatsAppSession.find({
            status: { $in: ["active", "paused"] },
            expiresAt: { $gt: now },
            $or: [
                { "settings.groupPromotionBroadcast": { $exists: false } },
                { "settings.groupPromotionBroadcast": true }
            ]
        }).select("_id phone status");

        if (!sessions.length) {
            console.log("📣 [GroupBroadcast] No eligible deployed sessions.");
            return;
        }

        console.log(`📣 [GroupBroadcast] Starting for ${sessions.length} deployed session(s)...`);

        let totalSent = 0;
        let totalFailed = 0;
        let totalGroups = 0;

        for (const s of sessions) {
            const sid = s._id.toString();
            try {
                if (!sessionManager.isConnected(sid)) {
                    await sessionManager.connectSession(sid);
                }

                const result = await sessionManager.sendGroupPromotionBroadcast(sid, {
                    groupDelayMs: 60_000
                });
                totalSent += Number(result?.sent || 0);
                totalFailed += Number(result?.failed || 0);
                totalGroups += Number(result?.total || 0);
            } catch (err) {
                totalFailed += 1;
                console.warn(`[GroupBroadcast] Session ${sid} failed:`, err.message);
            }
        }

        console.log(
            `📣 [GroupBroadcast] Completed. Groups: ${totalGroups}, Sent: ${totalSent}, Failed: ${totalFailed}`
        );
    } catch (error) {
        console.error("❌ [GroupBroadcast] Error:", error.message);
    } finally {
        isRunning = false;
    }
}
