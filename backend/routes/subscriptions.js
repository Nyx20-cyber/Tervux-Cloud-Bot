import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import { createTransaction, checkTransactionStatus, getBalance } from "../services/paymentService.js";

const router = Router();

/**
 * GET /api/plans
 * List available subscription plans (public)
 */
router.get("/plans", async (req, res) => {
    try {
        const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
        res.json({ plans });
    } catch (error) {
        console.error("List plans error:", error);
        res.status(500).json({ error: "Failed to list plans" });
    }
});

/**
 * GET /api/subscription
 * Get user's current subscription
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const sessions = await WhatsAppSession.find({ userId: req.user._id }).populate("subscription.planId");

        const subscriptions = [];
        for (const session of sessions) {
            const sub = session.subscription;
            let isExpired = false;
            if (sub?.expiresAt && new Date(sub.expiresAt) < new Date()) {
                isExpired = true;
                if (sub.status === "active") {
                    session.subscription.status = "expired";
                    session.status = "expired";
                    await session.save();
                }
            }
            if (sub?.planId) {
                subscriptions.push({
                    sessionId: session._id,
                    phone: session.phone,
                    plan: sub.planId,
                    status: sub.status || "none",
                    activatedAt: sub.activatedAt || null,
                    expiresAt: sub.expiresAt || null,
                    isExpired
                });
            }
        }
        res.json({ subscriptions });
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
        const { planSlug, payerPhone, sessionId } = req.body;

        if (!planSlug || !payerPhone || !sessionId) {
            return res.status(400).json({ error: "planSlug, payerPhone, and sessionId are required" });
        }

        const plan = await Plan.findOne({ slug: planSlug, isActive: true });
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }

        // Create FastLipa transaction (sends M-Pesa/Tigo push to phone)
        const fastlipaResult = await createTransaction(
            payerPhone,
            plan.price,
            req.user.name
        );

        // FastLipa returns: { status, message, data: { tranID, amount, number, network, status, time } }
        const tranId = fastlipaResult.data?.tranID || fastlipaResult.tranid || fastlipaResult.id || null;

        if (!tranId) {
            console.error("FastLipa: No transaction ID in response:", JSON.stringify(fastlipaResult));
            return res.status(502).json({ error: "Payment gateway error — no transaction ID returned" });
        }

        // Save payment record as pending
        const payment = await Payment.create({
            userId: req.user._id,
            sessionId: sessionId,
            planId: plan._id,
            amount: plan.price,
            currency: "TZS",
            fastlipaTransactionId: tranId,
            status: "pending",
            payerPhone
        });

        res.json({
            success: true,
            message: "Payment initiated. Check your phone for M-Pesa/Tigo prompt.",
            paymentId: payment._id,
            transactionId: tranId,
            amount: plan.price,
            plan: plan.name
        });
    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: error.message || "Payment initiation failed" });
    }
});

/**
 * GET /api/subscription/payment-status/:paymentId
 * Check payment result and activate subscription on success
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

        // If already completed, return immediately
        if (payment.status === "completed") {
            return res.json({
                status: "completed",
                message: "Subscription activated!",
                plan: payment.planId?.name
            });
        }

        if (payment.status === "failed") {
            return res.json({ status: "failed", message: "Payment failed." });
        }

        // Poll FastLipa for status update
        if (payment.fastlipaTransactionId) {
            const statusResult = await checkTransactionStatus(payment.fastlipaTransactionId);
            console.log("💳 FastLipa status check:", JSON.stringify(statusResult));

            // FastLipa returns: { status, data: { tranID, status, amount, ... } }
            const txStatus = (statusResult.data?.status || statusResult.status || "").toUpperCase();

            const isCompleted = txStatus === "COMPLETED" || txStatus === "SUCCESS" ||
                statusResult.paid === true;

            if (isCompleted) {
                payment.status = "completed";
                await payment.save();

                // Activate subscription on the specific session
                const session = await WhatsAppSession.findById(payment.sessionId);
                const plan = payment.planId;
                const now = new Date();

                // If session has active subscription that hasn't expired, extend it
                let startDate = now;
                if (session.subscription?.status === "active" &&
                    session.subscription?.expiresAt > now &&
                    session.subscription?.planId?.toString() === plan._id.toString()) {
                    startDate = new Date(session.subscription.expiresAt);
                }

                session.subscription = {
                    planId: plan._id,
                    status: "active",
                    activatedAt: now,
                    expiresAt: new Date(startDate.getTime() + plan.durationDays * 86400000)
                };
                session.status = "active";
                await session.save();

                // Reconnect if offline
                import("../services/whatsappService.js").then(({ sessionManager }) => {
                    if (!sessionManager.isConnected(session._id.toString())) {
                        sessionManager.connectSession(session._id.toString());
                    }
                });

                return res.json({
                    status: "completed",
                    message: "Subscription activated for session!",
                    plan: plan.name,
                    expiresAt: session.subscription.expiresAt
                });
            }

            const isFailed = txStatus === "FAILED" || txStatus === "CANCELLED" ||
                txStatus === "REJECTED" || txStatus === "EXPIRED";

            if (isFailed) {
                payment.status = "failed";
                await payment.save();
                return res.json({ status: "failed", message: "Payment was not completed." });
            }
        }

        res.json({
            status: "pending",
            message: "Waiting for payment confirmation..."
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
            .populate("planId", "name price durationDays")
            .sort({ createdAt: -1 })
            .limit(20);
        res.json({ payments });
    } catch (error) {
        console.error("Payment history error:", error);
        res.status(500).json({ error: "Failed to fetch payment history" });
    }
});

export default router;
