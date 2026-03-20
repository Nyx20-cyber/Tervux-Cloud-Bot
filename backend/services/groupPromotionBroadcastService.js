import WhatsAppSession from "../models/WhatsAppSession.js";
import { sessionManager } from "./whatsappService.js";

let isRunning = false;
const EAT_TIMEZONE = "Africa/Dar_es_Salaam";

const getEatDateKey = () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: EAT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
};

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
        const dateKey = getEatDateKey();
        const sessions = await WhatsAppSession.find({
            status: { $in: ["active", "paused"] },
            expiresAt: { $gt: now },
            "settings.groupPromotionBroadcast": true
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
                const claimed = await WhatsAppSession.findOneAndUpdate(
                    {
                        _id: s._id,
                        $or: [
                            { lastGroupPromotionBroadcastDateKey: { $exists: false } },
                            { lastGroupPromotionBroadcastDateKey: { $ne: dateKey } }
                        ]
                    },
                    {
                        $set: {
                            lastGroupPromotionBroadcastDateKey: dateKey,
                            lastGroupPromotionBroadcastAt: new Date()
                        }
                    },
                    { returnDocument: "after" }
                ).select("_id");

                if (!claimed) {
                    console.log(`📣 [GroupBroadcast] Skipping ${sid}; already sent for ${dateKey}.`);
                    continue;
                }

                if (!sessionManager.isConnected(sid)) {
                    await sessionManager.connectSession(sid);
                }

                const result = await sessionManager.sendGroupPromotionBroadcast(sid, {
                    groupDelayMs: 60_000,
                    ignoreScheduleSetting: true
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
