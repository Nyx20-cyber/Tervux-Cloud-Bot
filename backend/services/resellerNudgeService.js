import WhatsAppSession from "../models/WhatsAppSession.js";
import { sessionManager } from "./whatsappService.js";

const RESELLER_NUDGE_DELAY_MS = Number.parseInt(
    process.env.RESELLER_NUDGE_DELAY_MS || process.env.RESLLER_NUDGE_DELAY_MS || "12000",
    10
);

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Daily reseller nudge:
 * Sends a business opportunity DM to users who currently have a valid deployment.
 */
export async function runResellerNudge() {
    try {
        const enabled = true;
        if (!enabled) return;

        const now = new Date();
        const startedAt = new Date();
        console.log(`📣 [ResellerNudge] Started at ${startedAt.toISOString()}`);
        const sessions = await WhatsAppSession.find({
            status: { $in: ["active", "paused"] },
            expiresAt: { $gt: now }
        }).select("_id userId lastConnected createdAt").sort({ lastConnected: -1, createdAt: -1 });

        if (!sessions.length) {
            console.log("📣 [ResellerNudge] No eligible deployed sessions.");
            return;
        }

        console.log(`📣 [ResellerNudge] Eligible deployed sessions: ${sessions.length}; delay=${RESELLER_NUDGE_DELAY_MS}ms`);

        let sentCount = 0;
        let failedCount = 0;
        let attemptedCount = 0;

        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const sessionId = session._id.toString();
            attemptedCount += 1;

            try {
                if (!sessionManager.isConnected(sessionId)) {
                    await sessionManager.connectSession(sessionId);
                }

                const ok = await sessionManager.sendResellerOpportunityMessage(sessionId, {
                    coinsPack: 250,
                    packPrice: 3000,
                    deployCost: 12,
                    deployDurationDays: 7,
                    samplePerBotA: 2000,
                    samplePerBotB: 2500
                });
                if (ok) {
                    sentCount += 1;
                    console.log(`📣 [ResellerNudge] Sent reseller DM (${sentCount}/${sessions.length}) to session ${sessionId}.`);
                }
            } catch (err) {
                failedCount += 1;
                console.warn(`[ResellerNudge] Failed for session ${session._id}:`, err.message);
            }

            // Throttle to avoid DM spam bursts across many sessions.
            if (i < sessions.length - 1 && RESELLER_NUDGE_DELAY_MS > 0) {
                await wait(RESELLER_NUDGE_DELAY_MS);
            }
        }

        const finishedAt = new Date();
        console.log(
            `📣 [ResellerNudge] Completed. attempted=${attemptedCount}, sent=${sentCount}, failed=${failedCount}, startedAt=${startedAt.toISOString()}, finishedAt=${finishedAt.toISOString()}`
        );
    } catch (error) {
        console.error("❌ [ResellerNudge] Error:", error.message);
    }
}
