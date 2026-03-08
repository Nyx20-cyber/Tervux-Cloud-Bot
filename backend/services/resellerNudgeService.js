import WhatsAppSession from "../models/WhatsAppSession.js";
import { sessionManager } from "./whatsappService.js";

/**
 * Daily reseller nudge:
 * Sends a business opportunity DM to users who currently have a valid deployment.
 */
export async function runResellerNudge() {
    try {
        const enabled = true;
        if (!enabled) return;

        const now = new Date();
        const sessions = await WhatsAppSession.find({
            status: { $in: ["active", "paused"] },
            expiresAt: { $gt: now }
        }).select("_id userId lastConnected").sort({ lastConnected: -1, createdAt: -1 });

        if (!sessions.length) {
            console.log("📣 [ResellerNudge] No eligible deployed sessions.");
            return;
        }

        let sentCount = 0;

        for (const session of sessions) {
            const sessionId = session._id.toString();

            try {
                if (!sessionManager.isConnected(sessionId)) {
                    await sessionManager.connectSession(sessionId);
                }

                const ok = await sessionManager.sendResellerOpportunityMessage(sessionId, {
                    coinsPack: 250,
                    packPrice: 3000,
                    deployCost: 50,
                    samplePerBotA: 2000,
                    samplePerBotB: 2500
                });
                if (ok) {
                    sentCount += 1;
                }
            } catch (err) {
                console.warn(`[ResellerNudge] Failed for session ${session._id}:`, err.message);
            }
        }

        console.log(`📣 [ResellerNudge] Sent to ${sentCount} user(s).`);
    } catch (error) {
        console.error("❌ [ResellerNudge] Error:", error.message);
    }
}
