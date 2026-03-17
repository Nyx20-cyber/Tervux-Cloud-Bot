import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import { emitToUser, emitUpdate } from "./socketService.js";
import { getSettings } from "../models/SystemSettings.js";
import { shouldHaveVip, VIP_TOTAL_REFERRALS_THRESHOLD } from "./gamificationService.js";

export function extractFastLipaFields(payload) {
    const root = payload && typeof payload === "object" ? payload : {};
    const data = root.data && typeof root.data === "object" ? root.data : root;

    const transactionId = String(
        data.tranid ||
        data.tranID ||
        root.tranid ||
        root.tranID ||
        ""
    ).trim();

    const paymentStatus = String(
        data.payment_status ||
        data.status ||
        root.payment_status ||
        root.status ||
        ""
    ).trim().toUpperCase();

    return { transactionId, paymentStatus, data };
}

export async function settleCompletedPayment(paymentId, gatewayResponse, source = "unknown") {
    const existingPayment = await Payment.findById(paymentId).select("gatewayResponse gatewayReference");
    const mergedGatewayResponse = {
        ...(existingPayment?.gatewayResponse || {}),
        finalGatewayResponse: gatewayResponse,
        lastSettlementSource: source,
        settledAt: new Date().toISOString()
    };
    const derivedReference = String(
        gatewayResponse?.reference ||
        gatewayResponse?.tx_ref ||
        gatewayResponse?.transaction_id ||
        gatewayResponse?.tranid ||
        gatewayResponse?.tranID ||
        ""
    ).trim() || null;

    const completedPayment = await Payment.findOneAndUpdate(
        { _id: paymentId, status: "pending" },
        {
            $set: {
                status: "completed",
                gatewayResponse: mergedGatewayResponse,
                ...(derivedReference ? { gatewayReference: derivedReference } : {})
            }
        },
        { returnDocument: "after" }
    ).populate("planId");

    if (!completedPayment) {
        return { ok: true, state: "already_processed" };
    }

    const plan = completedPayment.planId;
    if (!plan) {
        return { ok: false, state: "missing_plan" };
    }

    const User = (await import("../models/User.js")).default;
    const user = await User.findById(completedPayment.userId);
    if (!user) {
        return { ok: false, state: "missing_user" };
    }

    user.coins = (user.coins || 0) + (plan.coinsAmount || 0);
    await user.save();
    emitToUser(user._id, "balance_update", { coins: user.coins });

    if (user.referredBy && !user.referredByPaid) {
        const markedUser = await User.findOneAndUpdate(
            { _id: user._id, referredByPaid: false },
            { $set: { referredByPaid: true } },
            { new: true }
        );

        if (markedUser) {
            const settings = await getSettings();
            const bonusAmount = settings.referralBonus || 10;

            const referrer = await User.findByIdAndUpdate(
                user.referredBy,
                {
                    $inc: {
                        coins: bonusAmount,
                        totalReferrals: 1,
                        weeklyReferralCount: 1,
                        totalReferralCoinsEarned: bonusAmount
                    }
                },
                { new: true }
            );

            if (referrer) {
                let earnedNewBadge = false;
                let earnedVIP = false;

                if (referrer.totalReferrals >= 10 && !referrer.badges.includes("social_butterfly")) {
                    referrer.badges.push("social_butterfly");
                    referrer.badges = referrer.badges.filter((b) => b !== "pioneer");
                    earnedNewBadge = true;
                }
                if (shouldHaveVip({
                    totalDeployments: referrer.totalDeployments,
                    totalCoinsSpent: referrer.totalCoinsSpent,
                    totalReferrals: referrer.totalReferrals
                }) && !referrer.isVIP) {
                    referrer.isVIP = true;
                    earnedVIP = true;
                }
                if (earnedNewBadge || earnedVIP) {
                    await referrer.save();
                }

                emitToUser(referrer._id, "balance_update", { coins: referrer.coins });

                const badgeMsg = earnedNewBadge ? "\n\nYou also unlocked the 'Social Butterfly' badge! 🦋" : "";
                const vipMsg = earnedVIP
                    ? `\n\n🎉 Incredible! You have unlocked VIP Status by reaching ${VIP_TOTAL_REFERRALS_THRESHOLD} referrals! 💎`
                    : "";
                const referralNotify = await Notification.create({
                    userId: referrer._id,
                    title: "Referral Reward Earned! ✅",
                    message: `Success! A user you referred just made their first purchase. You've earned ${bonusAmount} free coins 🪙!${badgeMsg}${vipMsg}`,
                    type: "success"
                });
                emitToUser(referrer._id, "new_notification", referralNotify);
            }
        }
    }

    const paymentNotify = await Notification.create({
        userId: user._id,
        title: "Coins Added 🪙",
        message: `Successfully received ${plan.coinsAmount} coins from your payment for "${plan.name}" via ${source}.`,
        type: "success"
    });

    emitToUser(user._id, "new_notification", paymentNotify);
    emitToUser(user._id, "payment_update", {
        paymentId: completedPayment._id,
        status: "completed",
        message: `🪙 Payment successful! You received ${plan.coinsAmount} coins.`,
        coins: user.coins
    });
    emitUpdate("admin_payment_updated", {
        paymentId: completedPayment._id.toString(),
        status: "completed"
    });

    return { ok: true, state: "completed", payment: completedPayment, user };
}

export async function settleFailedPayment(paymentId, failureStatus, failureReason, gatewayResponse) {
    const existingPayment = await Payment.findById(paymentId).select("gatewayResponse gatewayReference");
    const mergedGatewayResponse = {
        ...(existingPayment?.gatewayResponse || {}),
        finalGatewayResponse: gatewayResponse,
        lastSettlementSource: "failure",
        settledAt: new Date().toISOString()
    };
    const derivedReference = String(
        gatewayResponse?.reference ||
        gatewayResponse?.tx_ref ||
        gatewayResponse?.transaction_id ||
        gatewayResponse?.tranid ||
        gatewayResponse?.tranID ||
        ""
    ).trim() || null;

    const payment = await Payment.findOneAndUpdate(
        { _id: paymentId, status: "pending" },
        {
            $set: {
                status: failureStatus,
                failureReason,
                gatewayResponse: mergedGatewayResponse,
                ...(derivedReference ? { gatewayReference: derivedReference } : {})
            }
        },
        { returnDocument: "after" }
    );

    if (!payment) {
        return { ok: true, state: "already_processed" };
    }

    emitToUser(payment.userId.toString(), "payment_update", {
        paymentId: payment._id,
        status: payment.status,
        message: payment.failureReason
    });
    emitUpdate("admin_payment_updated", {
        paymentId: payment._id.toString(),
        status: payment.status
    });

    return { ok: true, state: payment.status, payment };
}
