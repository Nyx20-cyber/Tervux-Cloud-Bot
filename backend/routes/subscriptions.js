import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Notification from "../models/Notification.js";
import { createTransaction, getBalance } from "../services/paymentService.js";
import {
    createCardPayment,
    checkOrderStatus,
    verifyBongoPayWebhook,
    extractBongoPayStatusPayload,
    extractBongoPayOrderStatus,
    normalizeBongoPayPhone
} from "../services/bongopayService.js";
import FastLipaWebhookLog from "../models/FastLipaWebhookLog.js";
import { emitUpdate } from "../services/socketService.js";
import { settleCompletedPayment, settleFailedPayment } from "../services/paymentSettlement.js";
import { getSettings } from "../models/SystemSettings.js";
import { BONGOPAY_WEBHOOK_URL, BONGOPAY_REDIRECT_URL } from "../env.js";

const router = Router();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function debugLog(...args) {
    if (!IS_PRODUCTION) {
        console.log(...args);
    }
}

function getPublicBaseUrl(req) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const host = forwardedHost || req.get("host") || "";
    const protocol = forwardedProto || req.protocol || "https";
    return `${protocol}://${host}`;
}

function getBongoPayWebhookUrl(req) {
    return BONGOPAY_WEBHOOK_URL || `${getPublicBaseUrl(req)}/api/subscription/webhooks/bongopay`;
}

function getBongoPayCallbackUrl(req) {
    return `${getPublicBaseUrl(req)}/api/subscription/bongopay/callback`;
}

function getFrontendBillingUrl() {
    return BONGOPAY_REDIRECT_URL || "https://bot.tervux.com/dashboard/billing";
}

function buildFrontendBillingUrl(paymentId = "", extraParams = {}) {
    const url = new URL(getFrontendBillingUrl());
    if (paymentId) {
        url.searchParams.set("paymentId", paymentId);
    }
    url.searchParams.set("provider", "bongopay");
    for (const [key, value] of Object.entries(extraParams)) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

function normalizeGenericPhone(value) {
    return String(value || "").trim().replace(/[^\d+]/g, "");
}

function normalizeFastLipaPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("255") && digits.length === 12) {
        return `0${digits.slice(3)}`;
    }
    if (digits.length === 9 && /^[67]\d{8}$/.test(digits)) {
        return `0${digits}`;
    }
    return digits;
}

async function settleBongoPayPayment(payment, source = "bongopay_polling") {
    const statusResult = await checkOrderStatus(payment._id.toString());
    const { paymentStatus: rawStatus, reference, data } = extractBongoPayOrderStatus(statusResult);
    const paymentStatus = normalizeGatewayStatus(rawStatus);

    if (reference && payment.gatewayReference !== reference) {
        payment.gatewayReference = reference;
    }
    payment.gatewayResponse = {
        ...(payment.gatewayResponse || {}),
        lastBongoPayStatus: statusResult,
        lastPolledAt: new Date().toISOString()
    };
    await payment.save();

    if (paymentStatus === "COMPLETED") {
        return settleCompletedPayment(payment._id, {
            provider: "bongopay",
            reference,
            data
        }, source);
    }

    if (paymentStatus === "FAILED") {
        return settleFailedPayment(payment._id, "failed", "Card payment failed.", {
            provider: "bongopay",
            reference,
            data
        });
    }

    if (paymentStatus === "CANCELLED") {
        return settleFailedPayment(payment._id, "cancelled", "Card payment was cancelled.", {
            provider: "bongopay",
            reference,
            data
        });
    }

    return { ok: true, state: "pending", paymentStatus };
}

function normalizeGatewayStatus(statusValue) {
    const status = String(statusValue || "").trim().toLowerCase();
    if (status === "completed" || status === "successful" || status === "success") return "COMPLETED";
    if (status === "failed" || status === "failure") return "FAILED";
    if (status === "cancelled" || status === "canceled" || status === "usercancelled" || status === "rejected") return "CANCELLED";
    if (status === "pending" || status === "processing" || status === "in_progress" || status === "inprogress") return "PENDING";
    return "";
}

async function deletePendingPaymentRecord(payment) {
    if (!payment) return;
    await FastLipaWebhookLog.deleteMany({ matchedPaymentId: payment._id });
    await Payment.deleteOne({ _id: payment._id });
    emitUpdate("admin_payment_deleted", {
        paymentId: payment._id.toString()
    });
}

// Plans listing is handled by app.js at GET /api/plans

/**
 * GET /api/subscription
 * Legacy endpoint: return user's active deployments
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const sessions = await WhatsAppSession.find({ userId: req.user._id });
        const activeDeployments = sessions
            .filter((session) => session.expiresAt && new Date(session.expiresAt) > new Date())
            .map((session) => ({
                sessionId: session._id,
                phone: session.phone,
                status: session.status,
                expiresAt: session.expiresAt
            }));

        for (const session of sessions) {
            if (!session.expiresAt) continue;
            const daysLeft = Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 2 && daysLeft > 0) {
                const lastNotif = await Notification.findOne({
                    userId: req.user._id,
                    title: "Deployment Expiring",
                    createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                });

                if (!lastNotif) {
                    await Notification.create({
                        userId: req.user._id,
                        title: "Deployment Expiring",
                        message: `Your deployment for ${session.phone} expires in ${daysLeft} day(s). Top up coins to keep it active.`,
                        type: "warning",
                        link: "/dashboard/billing"
                    });
                }
            }
        }

        res.json({ subscriptions: activeDeployments });
    } catch (error) {
        console.error("Get subscription error:", error);
        res.status(500).json({ error: "Failed to get subscription" });
    }
});

/**
 * POST /api/subscription/checkout
 * Initiate payment via FastLipa
 * Body: { planSlug: "siku" | "wiki" | "mwezi", payerPhone: "0695123456" }
 */
router.post("/checkout", authenticate, async (req, res) => {
    try {
        const { planSlug, payerPhone } = req.body;
        const normalizedPhone = normalizeFastLipaPhone(payerPhone);
        console.log("[CHECKOUT] Request received", {
            userId: req.user?._id?.toString?.(),
            planSlug,
            payerPhone: normalizedPhone
        });

        if (!planSlug || !normalizedPhone) {
            return res.status(400).json({ error: "planSlug and payerPhone are required" });
        }

        if (!/^0[67]\d{8}$/.test(normalizedPhone)) {
            return res.status(400).json({ error: "Please provide a valid Tanzanian mobile number" });
        }

        const plan = await Plan.findOne({ slug: planSlug, isActive: true });
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }

        const pendingCutoff = new Date(Date.now() - 3 * 60 * 1000);
        const existingPending = await Payment.findOne({
            userId: req.user._id,
            planId: plan._id,
            payerPhone: normalizedPhone,
            status: "pending",
            createdAt: { $gt: pendingCutoff }
        }).sort({ createdAt: -1 });

        if (existingPending) {
            console.log("[CHECKOUT] Existing pending payment found", {
                userId: req.user._id.toString(),
                paymentId: existingPending._id.toString(),
                transactionId: existingPending.fastlipaTransactionId || null
            });
            return res.status(409).json({
                error: "You already have a pending payment request. Complete or wait for it to expire before trying again.",
                paymentId: existingPending._id,
                transactionId: existingPending.fastlipaTransactionId
            });
        }

        // Create local draft first so every checkout attempt has an auditable DB record.
        const payment = await Payment.create({
            userId: req.user._id,
            planId: plan._id,
            amount: plan.price,
            provider: "fastlipa",
            paymentMethod: "mobile_money_tz",
            currency: "TZS",
            status: "pending",
            payerPhone: normalizedPhone,
            gatewayResponse: {
                draft: true,
                createdAt: new Date().toISOString()
            }
        });
        emitUpdate("admin_payment_updated", {
            paymentId: payment._id.toString(),
            status: "pending"
        });

        try {
            // Create FastLipa transaction (sends M-Pesa/Tigo push to phone)
            const fastlipaResult = await createTransaction(
                normalizedPhone,
                plan.price,
                req.user.name
            );

            // FastLipa returns: { status, message, data: { tranID, amount, number, network, status, time } }
            const tranId = fastlipaResult.data?.tranID || fastlipaResult.tranid || fastlipaResult.id || null;

            if (!tranId) {
                console.error("FastLipa: No transaction ID in response:", JSON.stringify(fastlipaResult));
                payment.status = "failed";
                payment.failureReason = "Gateway did not return transaction ID.";
                payment.gatewayResponse = fastlipaResult;
                await payment.save();
                return res.status(502).json({
                    error: "Payment gateway error — no transaction ID returned",
                    paymentId: payment._id
                });
            }

            payment.fastlipaTransactionId = tranId;
            payment.gatewayReference = tranId;
            payment.gatewayResponse = fastlipaResult;
            await payment.save();

            console.log("[CHECKOUT] Payment draft upgraded to pending", {
                paymentId: payment._id.toString(),
                transactionId: tranId
            });

            res.json({
                success: true,
                message: "Payment initiated. Check your phone for M-Pesa/Tigo prompt.",
                paymentId: payment._id,
                transactionId: tranId,
                amount: plan.price,
                plan: plan.name
            });
        } catch (gatewayError) {
            payment.status = "failed";
            payment.failureReason = gatewayError.message || "Payment gateway request failed";
            payment.gatewayResponse = {
                gatewayError: payment.failureReason
            };
            await payment.save();
            emitUpdate("admin_payment_updated", {
                paymentId: payment._id.toString(),
                status: "failed"
            });

            console.error("[CHECKOUT] Gateway request failed", {
                paymentId: payment._id.toString(),
                error: payment.failureReason
            });

            return res.status(502).json({
                error: payment.failureReason,
                paymentId: payment._id
            });
        }
    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: error.message || "Payment initiation failed" });
    }
});

/**
 * POST /api/subscription/checkout/minipay
 * Provide manual MiniPay payment instructions
 * Body: { planSlug, buyerPhone }
 */
router.post("/checkout/minipay", authenticate, async (req, res) => {
    try {
        const { planSlug, buyerPhone } = req.body;
        const normalizedPhone = normalizeBongoPayPhone(buyerPhone);

        if (!planSlug || !normalizedPhone) {
            return res.status(400).json({ error: "planSlug and buyerPhone are required" });
        }

        const plan = await Plan.findOne({ slug: planSlug, isActive: true });
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }
        
        // Create local draft first so every checkout attempt has an auditable DB record.
        const payment = await Payment.create({
            userId: req.user._id,
            planId: plan._id,
            amount: plan.price,
            provider: "minipay",
            paymentMethod: "manual_minipay",
            currency: "USD",
            status: "pending",
            payerPhone: normalizedPhone,
            gatewayResponse: {
                draft: true,
                createdAt: new Date().toISOString()
            }
        });
        emitUpdate("admin_payment_updated", {
            paymentId: payment._id.toString(),
            status: "pending"
        });

        const settings = await getSettings();
        const supportPhone = settings.supportPhone || "+255629360383";

        res.json({
            success: true,
            paymentId: payment._id,
            provider: "minipay",
            amount: plan.price,
            currency: "USD",
            instructions: `To pay via MiniPay:\n1. Open MiniPay app.\n2. Send funds to ${supportPhone}.\n3. Take a screenshot of the successful transaction.\n4. Send the screenshot and your email (${req.user.email}) to WhatsApp ${supportPhone}.\n5. We will credit your coins manually within 30 minutes.`,
            supportPhone: supportPhone,
            plan: plan.name
        });
    } catch (error) {
        console.error("MiniPay checkout error:", error);
        res.status(500).json({ error: error.message || "MiniPay payment initiation failed" });
    }
});


router.get("/bongopay/callback", async (req, res) => {
    const frontendBillingUrl = new URL(getFrontendBillingUrl());
    const paymentId = String(req.query.paymentId || "").trim();
    const orderId = String(req.query.order_id || req.query.orderId || "").trim();
    const paymentStatusRaw = String(req.query.payment_status || req.query.status || "").trim();
    const reference = String(req.query.reference || req.query.tx_ref || "").trim();

    const payment = paymentId
        ? await Payment.findById(paymentId).select("_id status provider gatewayReference")
        : (reference
            ? await Payment.findOne({ provider: "bongopay", gatewayReference: reference }).select("_id status provider gatewayReference")
            : null);

    if (payment && payment.provider === "bongopay" && payment.status === "pending") {
        if (reference && payment.gatewayReference !== reference) {
            payment.gatewayReference = reference;
            await payment.save();
        }
    }

    if (payment?._id) {
        frontendBillingUrl.searchParams.set("paymentId", payment._id.toString());
    } else if (paymentId) {
        frontendBillingUrl.searchParams.set("paymentId", paymentId);
    } else if (orderId) {
        // Backward compatibility with older flow.
        frontendBillingUrl.searchParams.set("paymentId", orderId);
        frontendBillingUrl.searchParams.set("orderId", orderId);
    }
    frontendBillingUrl.searchParams.set("provider", "bongopay");
    if (paymentStatusRaw) frontendBillingUrl.searchParams.set("payment_status", paymentStatusRaw);
    if (reference) frontendBillingUrl.searchParams.set("reference", reference);

    return res.redirect(frontendBillingUrl.toString());
});

router.post("/webhooks/bongopay", async (req, res) => {
    if (!verifyBongoPayWebhook(req.headers)) {
        return res.status(403).json({ error: "Invalid webhook signature" });
    }

    const payload = req.body || {};
    res.status(200).json({ received: true });

    setImmediate(async () => {
        const { orderId, paymentStatus: rawStatus, reference } = extractBongoPayStatusPayload(payload);
        const paymentStatus = normalizeGatewayStatus(rawStatus);
        try {
            const payment = orderId
                ? await Payment.findById(orderId).select("_id status provider gatewayReference")
                : (reference ? await Payment.findOne({ provider: "bongopay", gatewayReference: reference }).select("_id status provider gatewayReference") : null);

            await FastLipaWebhookLog.create({
                source: "bongopay",
                transactionId: orderId || reference,
                paymentStatus: paymentStatus || rawStatus,
                matchedPaymentId: payment?._id || null,
                headers: req.headers || {},
                payload,
                processingResult: "received"
            });

            if (!payment || payment.provider !== "bongopay") {
                return;
            }

            if (reference && payment.gatewayReference !== reference) {
                payment.gatewayReference = reference;
                await payment.save();
            }

            if (paymentStatus === "COMPLETED") {
                await settleCompletedPayment(payment._id, {
                    provider: "bongopay",
                    reference,
                    payload
                }, "BongoPay");
                return;
            }

            if (paymentStatus === "FAILED") {
                await settleFailedPayment(payment._id, "failed", "Card payment failed.", {
                    provider: "bongopay",
                    reference,
                    payload
                });
                return;
            }

            if (paymentStatus === "CANCELLED") {
                await settleFailedPayment(payment._id, "cancelled", "Card payment was cancelled.", {
                    provider: "bongopay",
                    reference,
                    payload
                });
            }
        } catch (error) {
            console.error("BongoPay webhook processing error:", error);
            try {
                await FastLipaWebhookLog.create({
                    source: "bongopay",
                    transactionId: String(payload.order_id || payload.reference || payload.tx_ref || ""),
                    paymentStatus: String(payload.payment_status || payload.status || ""),
                    headers: req.headers || {},
                    payload,
                    processingResult: "error",
                    notes: error.message || "Unknown BongoPay webhook error"
                });
            } catch {
                // Ignore secondary log failure
            }
        }
    });
});

/**
 * GET /api/subscription/payment-status/:paymentId
 * Check payment result from DATABASE ONLY (no FastLipa API calls here).
 * The background paymentVerifier cron handles FastLipa polling and updates the DB.
 */
router.get("/payment-status/:paymentId", authenticate, async (req, res) => {
    try {
        const payment = await Payment.findOne({
            _id: req.params.paymentId,
            userId: req.user._id
        }).populate("planId");

        if (!payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.status === "pending" && payment.provider === "bongopay") {
            const result = await settleBongoPayPayment(payment, "bongopay_polling");
            await payment.populate("planId");

            if (result.state === "completed") {
                const user = await User.findById(req.user._id);
                return res.json({
                    status: "completed",
                    message: `🪙 Payment successful! You received ${payment.planId?.coinsAmount || 0} coins.`,
                    plan: payment.planId?.name,
                    coins: user?.coins || 0
                });
            }

            if (result.state === "failed") {
                return res.json({ status: "failed", message: "Card payment failed." });
            }

            if (result.state === "cancelled") {
                return res.json({ status: "cancelled", message: "Card payment was cancelled." });
            }
        }

        if (payment.status === "completed") {
            const user = await User.findById(req.user._id);
            return res.json({
                status: "completed",
                message: `🪙 Payment successful! You received ${payment.planId?.coinsAmount || 0} coins.`,
                plan: payment.planId?.name,
                coins: user?.coins || 0
            });
        }

        if (payment.status === "failed") {
            return res.json({ status: "failed", message: payment.failureReason || "Payment failed." });
        }

        if (payment.status === "cancelled") {
            return res.json({ status: "cancelled", message: payment.failureReason || "Payment was cancelled." });
        }

        // Still pending — allow verifier/webhook to continue settlement window.
        const paymentAge = Date.now() - new Date(payment.createdAt).getTime();

        res.json({
            status: "pending",
            message: payment.provider === "minipay"
                ? "Your MiniPay payment is awaiting manual verification. Please send your transaction screenshot and account email to WhatsApp +255629360383."
                : payment.provider === "bongopay"
                ? (paymentAge > 120000
                    ? "Card payment is still being verified. Keep this page open or check again shortly."
                    : "Waiting for card payment confirmation...")
                : (paymentAge > 120000
                    ? "Payment is still being verified. Keep this page open or check again shortly."
                    : "Waiting for payment confirmation...")
        });
    } catch (error) {
        console.error("Payment status error:", error);
        res.status(500).json({ error: "Failed to check payment status" });
    }
});

/**
 * DELETE /api/subscription/payment/:paymentId
 * Cancel and remove a user's pending payment record immediately.
 */
router.delete("/payment/:paymentId", authenticate, async (req, res) => {
    try {
        const payment = await Payment.findOne({
            _id: req.params.paymentId,
            userId: req.user._id
        });

        if (!payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.status !== "pending") {
            return res.status(409).json({ error: "Only pending payments can be cancelled." });
        }

        await deletePendingPaymentRecord(payment);

        return res.json({
            success: true,
            paymentId: req.params.paymentId,
            message: "Payment was cancelled and removed."
        });
    } catch (error) {
        console.error("Cancel payment error:", error);
        return res.status(500).json({ error: "Failed to cancel payment" });
    }
});

/**
 * GET /api/subscription/balance (admin only)
 * Check FastLipa account balance
 */
router.get("/balance", authenticate, requireAdmin, async (req, res) => {
    try {
        const balance = await getBalance();
        res.json(balance);
    } catch (error) {
        console.error("Balance check error:", error);
        res.status(500).json({ error: "Failed to check balance" });
    }
});

/**
 * GET /api/subscription/payments
 * User's payment history
 */
router.get("/payments", authenticate, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user._id })
            .populate("planId", "name price")
            .sort({ createdAt: -1 })
            .limit(20);
        res.json({ payments });
    } catch (error) {
        console.error("Payment history error:", error);
        res.status(500).json({ error: "Failed to fetch payment history" });
    }
});

export default router;
