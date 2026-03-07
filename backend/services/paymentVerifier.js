import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Plan from "../models/Plan.js";
import Notification from "../models/Notification.js";
import { checkTransactionStatus } from "./paymentService.js";
import { emitToUser } from "./socketService.js";
import { getSettings } from "../models/SystemSettings.js";

/**
 * Background Payment Verifier
 * - Skips payments younger than 30s (let user respond to initial PIN prompt)
 * - Calls FastLipa status API ONCE at 30-60s mark (to catch completed payments)
 * - Auto-cancels anything older than 60s that is still PENDING (no more API calls)
 * 
 * IMPORTANT: FastLipa re-triggers PIN prompts on every status-transaction call,
 * so we MUST limit how many times we call it per payment.
 */
export async function verifyPendingPayments() {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pendingPayments = await Payment.find({
            status: "pending",
            createdAt: { $gt: cutoff }
        }).populate("planId");

        if (pendingPayments.length === 0) return;

        console.log(`💳 [PaymentVerifier] Checking ${pendingPayments.length} pending payment(s)...`);

        for (const payment of pendingPayments) {
            if (!payment.fastlipaTransactionId) continue;

            const paymentAge = Date.now() - new Date(payment.createdAt).getTime();
            const alreadyChecked = payment.gatewayResponse?.data?.payment_status !== undefined;

            try {
                // Phase 1: Too early (< 30s) — skip, let user respond to initial PIN prompt
                if (paymentAge < 30000) {
                    console.log(`   ⏳ [${payment.fastlipaTransactionId}] Waiting... (${Math.round(paymentAge / 1000)}s old)`);
                    continue;
                }

                // Phase 2: Check window (30-60s) — call FastLipa ONCE
                if (paymentAge <= 60000 && !alreadyChecked) {
                    const statusResult = await checkTransactionStatus(payment.fastlipaTransactionId);
                    const txStatus = (statusResult.data?.payment_status || statusResult.data?.status || "").toUpperCase();

                    payment.gatewayResponse = statusResult;
                    console.log(`   💳 [${payment.fastlipaTransactionId}] ONE-TIME check — API: "${statusResult.status}", Transaction: "${txStatus}"`);

                    if (txStatus === "COMPLETED" || txStatus === "SUCCESSFUL") {
                        payment.status = "completed";
                        await payment.save();

                        const plan = payment.planId;
                        if (plan) {
                            const User = (await import("../models/User.js")).default;
                            const user = await User.findById(payment.userId);
                            if (user) {
                                user.coins = (user.coins || 0) + (plan.coinsAmount || 0);
                                await user.save();
                                emitToUser(user._id, "balance_update", { coins: user.coins });
                                console.log(`   ✅ [${payment.fastlipaTransactionId}] Added ${plan.coinsAmount} coins to user ${user._id}`);

                                // Referral deferred reward logic
                                if (user.referredBy && !user.referredByPaid) {
                                    const settings = await getSettings();
                                    const bonusAmount = settings.referralBonus || 10;
                                    const referrer = await User.findById(user.referredBy);
                                    if (referrer) {
                                        referrer.coins = (referrer.coins || 0) + bonusAmount;
                                        referrer.totalReferrals = (referrer.totalReferrals || 0) + 1;
                                        referrer.weeklyReferralCount = (referrer.weeklyReferralCount || 0) + 1;

                                        let earnedNewBadge = false;
                                        let earnedVIP = false;

                                        // Badge check
                                        if (referrer.totalReferrals >= 10 && !referrer.badges.includes("social_butterfly")) {
                                            referrer.badges.push("social_butterfly");
                                            referrer.badges = referrer.badges.filter(b => b !== "pioneer");
                                            earnedNewBadge = true;
                                        }
                                        if (referrer.totalReferrals >= 50 && !referrer.isVIP) {
                                            referrer.isVIP = true;
                                            earnedVIP = true;
                                        }

                                        await referrer.save();
                                        emitToUser(referrer._id, "balance_update", { coins: referrer.coins });

                                        // Update user to prevent multiple rewards
                                        user.referredByPaid = true;
                                        await user.save();

                                        // Notify Referrer
                                        let badgeMsg = earnedNewBadge ? "\n\nYou also unlocked the 'Social Butterfly' badge! 🦋" : "";
                                        let vipMsg = earnedVIP ? "\n\n🎉 Incredible! You have unlocked VIP Status! 💎" : "";

                                        const referralNotify = await Notification.create({
                                            userId: referrer._id,
                                            title: "Referral Reward Earned! ✅",
                                            message: `Success! A user you referred just made their first purchase. You've earned ${bonusAmount} free coins 🪙!${badgeMsg}${vipMsg}`,
                                            type: "success"
                                        });
                                        emitToUser(referrer._id, "new_notification", referralNotify);
                                        console.log(`   🎁 [${payment.fastlipaTransactionId}] Awarded 10 referral coins to ${referrer._id}`);
                                    }
                                }

                                // Notification
                                await Notification.create({
                                    userId: user._id,
                                    title: "Coins Added 🪙",
                                    message: `Successfully received ${plan.coinsAmount} coins from your payment for "${plan.name}".`,
                                    type: "success"
                                });

                                emitToUser(payment.userId.toString(), "payment_update", {
                                    paymentId: payment._id,
                                    status: "completed",
                                    message: `🪙 Payment successful! You received ${plan.coinsAmount} coins.`,
                                    coins: user.coins
                                });
                            }
                        }
                        continue;
                    }

                    if (txStatus === "FAILED" || txStatus === "EXPIRED" || txStatus === "CANCELLED" || txStatus === "REJECTED") {
                        payment.status = txStatus === "CANCELLED" || txStatus === "REJECTED" ? "cancelled" : "failed";
                        payment.failureReason = txStatus === "CANCELLED" || txStatus === "REJECTED"
                            ? "Payment was cancelled."
                            : `Payment failed (${txStatus}).`;
                        await payment.save();
                        console.log(`   ❌ [${payment.fastlipaTransactionId}] ${payment.status}: ${txStatus}`);

                        emitToUser(payment.userId.toString(), "payment_update", {
                            paymentId: payment._id,
                            status: payment.status,
                            message: payment.failureReason
                        });
                        continue;
                    }

                    // Still PENDING after one-time check — save and wait for auto-cancel
                    await payment.save();
                    continue;
                }

                // Phase 3: Auto-cancel (> 60s and still pending) — NO more FastLipa calls
                if (paymentAge > 60000) {
                    payment.status = "cancelled";
                    payment.failureReason = "Payment expired — no confirmation received.";
                    await payment.save();
                    console.log(`   ⏰ [${payment.fastlipaTransactionId}] Auto-cancelled after ${Math.round(paymentAge / 1000)}s.`);

                    emitToUser(payment.userId.toString(), "payment_update", {
                        paymentId: payment._id,
                        status: "cancelled",
                        message: "Payment expired. You did not confirm in time. No charges were made."
                    });
                }

            } catch (err) {
                console.error(`   ⚠️ [${payment.fastlipaTransactionId}] Check failed:`, err.message);
            }

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
