import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Plan from "../models/Plan.js";
import { checkTransactionStatus } from "./paymentService.js";

/**
 * Background Payment Verifier
 * Checks all pending payments with FastLipa and activates subscriptions
 * on confirmed payments. Runs on a cron schedule.
 */
export async function verifyPendingPayments() {
    try {
        // Find payments that are still pending and less than 24h old
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pendingPayments = await Payment.find({
            status: "pending",
            createdAt: { $gt: cutoff }
        }).populate("planId");

        if (pendingPayments.length === 0) return;

        console.log(`💳 [PaymentVerifier] Checking ${pendingPayments.length} pending payment(s)...`);

        for (const payment of pendingPayments) {
            if (!payment.fastlipaTransactionId) continue;

            try {
                const statusResult = await checkTransactionStatus(payment.fastlipaTransactionId);
                const txStatus = (statusResult.data?.status || statusResult.status || "").toUpperCase();

                console.log(`   💳 [${payment.fastlipaTransactionId}] Status: ${txStatus}`);

                if (txStatus === "COMPLETED" || txStatus === "SUCCESS") {
                    // Mark payment as completed
                    payment.status = "completed";
                    await payment.save();

                    // Add coins to user based on plan
                    const plan = payment.planId;
                    if (plan) {
                        const User = (await import("../models/User.js")).default;
                        const user = await User.findById(payment.userId);
                        if (user) {
                            user.coins = (user.coins || 0) + (plan.coinsAmount || 0);
                            await user.save();
                            console.log(`   ✅ [${payment.fastlipaTransactionId}] Added ${plan.coinsAmount} coins to user ${user._id} — ${plan.name}`);
                        }
                    }
                } else if (txStatus === "FAILED" || txStatus === "CANCELLED" || txStatus === "REJECTED" || txStatus === "EXPIRED") {
                    payment.status = "failed";
                    await payment.save();
                    console.log(`   ❌ [${payment.fastlipaTransactionId}] Payment failed.`);
                }
                // If still PENDING, do nothing — will check again next cycle
            } catch (err) {
                console.error(`   ⚠️ [${payment.fastlipaTransactionId}] Check failed:`, err.message);
            }

            // Rate limit: small delay between checks
            await new Promise(r => setTimeout(r, 1000));
        }

        // Mark very old pending payments (>24h) as failed
        const expiredPayments = await Payment.updateMany(
            { status: "pending", createdAt: { $lt: cutoff } },
            { $set: { status: "failed" } }
        );
        if (expiredPayments.modifiedCount > 0) {
            console.log(`   🧹 Marked ${expiredPayments.modifiedCount} expired pending payment(s) as failed.`);
        }

    } catch (error) {
        console.error("❌ [PaymentVerifier] Error:", error.message);
    }
}
