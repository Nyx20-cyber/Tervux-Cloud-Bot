import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Notification from "../models/Notification.js";
import { createTransaction, getBalance } from "../services/paymentService.js";
import { emitUpdate } from "../services/socketService.js";

const router = Router();

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
        const normalizedPhone = String(payerPhone || "").replace(/\D/g, "");
        console.log("[CHECKOUT] Request received", {
            userId: req.user?._id?.toString?.(),
            planSlug,
            payerPhone: normalizedPhone
        });

        if (!planSlug || !normalizedPhone) {
            return res.status(400).json({ error: "planSlug and payerPhone are required" });
        }

        if (!/^(0|\+?255)?[67]\d{8}$/.test(String(payerPhone).trim())) {
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
            message: paymentAge > 120000
                ? "Payment is still being verified. Keep this page open or check again shortly."
                : "Waiting for payment confirmation..."
        });
    } catch (error) {
        console.error("Payment status error:", error);
        res.status(500).json({ error: "Failed to check payment status" });
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
