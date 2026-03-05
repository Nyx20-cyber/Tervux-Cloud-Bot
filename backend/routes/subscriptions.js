import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Notification from "../models/Notification.js";
import { createTransaction, getBalance } from "../services/paymentService.js";

const router = Router();

// Plans listing is handled by app.js at GET /api/plans

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
            if (sub?.status === "active") {
                subscriptions.push({
                    sessionId: session._id,
                    phone: session.phone,
                    plan: sub.planId,
                    status: sub.status || "none",
                    activatedAt: sub.activatedAt || null
                });

                // Check for expiry (e.g., < 2 days)
                if (session.expiresAt) {
                    const daysLeft = Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (daysLeft <= 2 && daysLeft > 0) {
                        // Create notification if not already sent recently
                        const lastNotif = await Notification.findOne({
                            userId: req.user._id,
                            title: "Subscription Expiring",
                            createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // within last 24h
                        });

                        if (!lastNotif) {
                            await Notification.create({
                                userId: req.user._id,
                                title: "Subscription Expiring",
                                message: `Your subscription for ${session.phone} expires in ${daysLeft} day(s). Renew now to avoid service interruption.`,
                                type: "warning",
                                link: "/dashboard/billing"
                            });
                        }
                    }
                }
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
        const { planSlug, payerPhone } = req.body;

        if (!planSlug || !payerPhone) {
            return res.status(400).json({ error: "planSlug and payerPhone are required" });
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

        // Save payment record as pending with full gateway response
        const payment = await Payment.create({
            userId: req.user._id,
            planId: plan._id,
            amount: plan.price,
            currency: "TZS",
            fastlipaTransactionId: tranId,
            status: "pending",
            payerPhone,
            gatewayResponse: fastlipaResult
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

        // Still pending — auto-cancel if older than 60s (FastLipa won't update after this)
        const paymentAge = Date.now() - new Date(payment.createdAt).getTime();

        if (paymentAge > 60000) {
            payment.status = "cancelled";
            payment.failureReason = "Payment expired — no confirmation received.";
            await payment.save();
            return res.json({ status: "cancelled", message: "Payment expired. You did not confirm in time. No charges were made." });
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
