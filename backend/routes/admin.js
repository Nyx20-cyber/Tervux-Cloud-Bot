import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Announcement from "../models/Announcement.js";
import TutorialVideo from "../models/TutorialVideo.js";
import Notification from "../models/Notification.js";
import SystemSettings, { getCachedPublicSettings, getSettings, invalidateSettingsCache } from "../models/SystemSettings.js";
import FastLipaWebhookLog from "../models/FastLipaWebhookLog.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import { sessionManager } from "../services/whatsappService.js";
import { emitToUser, emitUpdate } from "../services/socketService.js";
import { checkTransactionStatus } from "../services/paymentService.js";
import { extractFastLipaFields, settleCompletedPayment, settleFailedPayment } from "../services/paymentSettlement.js";
import { checkOrderStatus, extractBongoPayOrderStatus } from "../services/bongopayService.js";
import { extractYoutubeVideoId, sanitize } from "./tutorials.js";
import mongoose from "mongoose";
import { shouldHaveVip } from "../services/gamificationService.js";
import { getJson, setJson, delKey } from "../lib/redis.js";

const router = Router();
const ADMIN_STATS_CACHE_TTL_SECONDS = Number(process.env.ADMIN_STATS_CACHE_TTL_SECONDS || 20);
const ADMIN_STATS_CACHE_KEY = "admin:stats:v1";
const PLANS_CACHE_KEY = "public:plans:v1";
const TUTORIALS_CACHE_KEY = "tutorials:active:v1";
const ANNOUNCEMENTS_CACHE_KEY_PATTERN = "announcements:active:*";

const buildPlatformSettingsPayload = (settingsDocOrObj) => ({
    maintenanceMode: !!settingsDocOrObj.maintenanceMode,
    registrationEnabled: !!settingsDocOrObj.registrationEnabled,
    supportPhone: settingsDocOrObj.supportPhone,
    siteName: settingsDocOrObj.siteName,
    commandFooter: settingsDocOrObj.commandFooter,
    kingBonusCoins: Number(settingsDocOrObj.kingBonusCoins || 100),
    referralBonus: Number(settingsDocOrObj.referralBonus || 10),
    dailyClaimBannerEnabled: settingsDocOrObj.dailyClaimBannerEnabled !== false,
    tutorialBannerEnabled: settingsDocOrObj.tutorialBannerEnabled !== false,
    tutorialBannerTutorialId: settingsDocOrObj.tutorialBannerTutorialId
        ? String(settingsDocOrObj.tutorialBannerTutorialId)
        : null
});

const emitPlatformSettingsUpdate = (settingsDocOrObj) => {
    emitUpdate("admin_settings_updated", { settings: settingsDocOrObj });
    emitUpdate("platform_settings_updated", buildPlatformSettingsPayload(settingsDocOrObj));
};

/**
 * GET /api/admin/stats
 * Platform analytics
 */
router.get("/stats", authenticate, requireAdmin, async (req, res) => {
    try {
        const cached = await getJson(ADMIN_STATS_CACHE_KEY);
        if (cached) {
            return res.json(cached);
        }

        const [
            totalUsers,
            activeSubscriptions,
            totalSessions,
            activeSessions,
            totalRevenue,
            recentPayments
        ] = await Promise.all([
            User.countDocuments(),
            WhatsAppSession.countDocuments({ expiresAt: { $gt: new Date() } }),
            WhatsAppSession.countDocuments(),
            WhatsAppSession.countDocuments({ status: "active" }),
            Payment.aggregate([
                { $match: { status: "completed" } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            Payment.find({ status: "completed" })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate("userId", "email name")
                .populate("planId", "name price")
        ]);

        const payload = {
            totalUsers,
            activeSubscriptions,
            totalSessions,
            activeSessions,
            liveConnections: sessionManager?.getActiveCount() || 0,
            totalRevenue: totalRevenue[0]?.total || 0,
            currency: "TZS",
            recentPayments
        };

        await setJson(ADMIN_STATS_CACHE_KEY, payload, ADMIN_STATS_CACHE_TTL_SECONDS);
        res.json(payload);
    } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

/**
 * GET /api/admin/users
 * List all users with pagination
 */
router.get("/users", authenticate, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const fetchAll = String(req.query.all || "").toLowerCase() === "true";
        const skip = fetchAll ? 0 : (page - 1) * limit;
        const search = String(req.query.search || "").trim();

        const query = {};
        if (search) {
            const conditions = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                { role: { $regex: search, $options: "i" } }
            ];
            query.$or = conditions;
        }

        const usersQuery = User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip);

        if (!fetchAll) {
            usersQuery.limit(limit);
        }

        const [users, total] = await Promise.all([
            usersQuery,
            User.countDocuments(query)
        ]);

        const usersData = users.map((u) => {
            const serialized = u.toJSON();
            serialized.isVIP = shouldHaveVip({
                totalDeployments: serialized.totalDeployments,
                totalCoinsSpent: serialized.totalCoinsSpent,
                totalReferrals: serialized.totalReferrals
            });
            return serialized;
        });
        const userIds = usersData.map((u) => u._id);
        const recentPayments = await Payment.find({ userId: { $in: userIds }, payerPhone: { $ne: "" } })
            .select("userId payerPhone createdAt")
            .sort({ createdAt: -1 })
            .lean();

        const phoneByUserId = new Map();
        for (const payment of recentPayments) {
            const id = payment.userId?.toString();
            if (!id || phoneByUserId.has(id)) continue;
            if (payment.payerPhone) phoneByUserId.set(id, String(payment.payerPhone));
        }

        for (const user of usersData) {
            user.phone = phoneByUserId.get(String(user._id)) || "";
        }

        res.json({
            users: usersData,
            total,
            page,
            pages: fetchAll ? 1 : Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Admin list users error:", error);
        res.status(500).json({ error: "Failed to list users" });
    }
});

/**
 * PUT /api/admin/users/:id
 * Update user (ban, change role)
 */
router.put("/users/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const { isBanned, role } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (isBanned !== undefined) user.isBanned = isBanned;
        if (role && ["user", "admin"].includes(role)) user.role = role;

        await user.save();
        const serializedUser = user.toJSON();
        await delKey(ADMIN_STATS_CACHE_KEY);

        emitUpdate("admin_user_updated", {
            user: serializedUser
        });

        emitToUser(user._id, "account_status_update", {
            isBanned: !!user.isBanned,
            role: user.role
        });

        if (isBanned === true) {
            emitToUser(user._id, "force_logout", {
                reason: "banned",
                message: "Your account has been suspended by an administrator."
            });
        }

        // If banned, disconnect their sessions
        if (isBanned) {
            const sessions = await WhatsAppSession.find({
                userId: user._id,
                status: { $in: ["active", "paused", "disconnected"] }
            });
            for (const session of sessions) {
                session.status = "disconnected";
                session.autoReconnectDisabled = true;
                session.disconnectIntent = "banned";
                session.lastDisconnectedAt = new Date();
                await session.save();
                await sessionManager.primeSessionRuntimeFromDocument(session);
                await sessionManager.destroySession(session._id.toString());
            }
        }

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Admin update user error:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Permanently delete a user and their related data
 */
router.delete("/users/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const targetUserId = String(req.params.id);

        if (String(req.user?._id) === targetUserId) {
            return res.status(400).json({ error: "You cannot delete your own admin account." });
        }

        const user = await User.findById(targetUserId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.role === "admin") {
            const adminCount = await User.countDocuments({ role: "admin" });
            if (adminCount <= 1) {
                return res.status(400).json({ error: "You cannot delete the last remaining admin account." });
            }
        }

        emitToUser(targetUserId, "force_logout", {
            reason: "deleted",
            message: "Your account has been deleted by an administrator."
        });

        await sessionManager.cancelPairingForUser(targetUserId);

        const sessions = await WhatsAppSession.find({ userId: targetUserId }).select("_id");
        for (const session of sessions) {
            await sessionManager.destroySession(session._id.toString());
        }

        const paymentIds = await Payment.find({ userId: targetUserId }).distinct("_id");

        await Promise.all([
            WhatsAppSession.deleteMany({ userId: targetUserId }),
            WhatsAppAuth.deleteMany({ sessionId: { $in: sessions.map((session) => session._id.toString()) } }),
            Notification.deleteMany({ userId: targetUserId }),
            Payment.deleteMany({ userId: targetUserId }),
            FastLipaWebhookLog.deleteMany({ matchedPaymentId: { $in: paymentIds } }),
            User.updateMany({ referredBy: targetUserId }, { $set: { referredBy: null, referredByPaid: false } }),
            User.deleteOne({ _id: targetUserId })
        ]);

        emitUpdate("admin_user_deleted", {
            userId: targetUserId
        });
        await delKey(ADMIN_STATS_CACHE_KEY);

        res.json({
            success: true,
            message: "User deleted permanently",
            userId: targetUserId
        });
    } catch (error) {
        console.error("Admin delete user error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

/**
 * GET /api/admin/payments
 * Full payment history with pagination, filtering, search
 */
router.get("/payments", authenticate, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const { status, search, from, to } = req.query;

        const filter = {};
        if (status && ["pending", "completed", "failed", "cancelled"].includes(status)) {
            filter.status = status;
        }
        if (search) {
            const conditions = [
                { payerPhone: { $regex: search, $options: "i" } },
                { fastlipaTransactionId: { $regex: search, $options: "i" } },
                { gatewayReference: { $regex: search, $options: "i" } },
                { provider: { $regex: search, $options: "i" } },
                { paymentMethod: { $regex: search, $options: "i" } }
            ];
            if (mongoose.Types.ObjectId.isValid(String(search))) {
                conditions.push({ _id: new mongoose.Types.ObjectId(String(search)) });
            }
            filter.$or = conditions;
        }
        if (from || to) {
            filter.createdAt = {};
            if (from) {
                const fromDate = new Date(String(from));
                if (!Number.isNaN(fromDate.getTime())) {
                    filter.createdAt.$gte = fromDate;
                }
            }
            if (to) {
                const toDate = new Date(String(to));
                if (!Number.isNaN(toDate.getTime())) {
                    toDate.setHours(23, 59, 59, 999);
                    filter.createdAt.$lte = toDate;
                }
            }
            if (Object.keys(filter.createdAt).length === 0) {
                delete filter.createdAt;
            }
        }

        const providerBucketsPipeline = [
            { $match: { ...filter, status: "completed" } },
            {
                $addFields: {
                    normalizedProvider: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$provider", "fastlipa"] }, then: "fastlipa" },
                                { case: { $eq: ["$provider", "bongopay"] }, then: "bongopay" },
                                { case: { $eq: ["$provider", "zenopay"] }, then: "bongopay" },
                                { case: { $eq: ["$paymentMethod", "mobile_money_tz"] }, then: "fastlipa" },
                                { case: { $eq: ["$paymentMethod", "card"] }, then: "bongopay" },
                                { case: { $ne: ["$fastlipaTransactionId", null] }, then: "fastlipa" },
                                { case: { $ne: ["$gatewayReference", null] }, then: "bongopay" }
                            ],
                            default: "unknown"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$normalizedProvider",
                    total: { $sum: "$amount" }
                }
            }
        ];

        const [payments, total, totalsByProvider] = await Promise.all([
            Payment.find(filter)
                .populate("userId", "email name phone")
                .populate("planId", "name price coinsAmount")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Payment.countDocuments(filter),
            Payment.aggregate(providerBucketsPipeline)
        ]);

        const summary = totalsByProvider.reduce((acc, entry) => {
            const provider = entry._id || "unknown";
            const totalValue = entry.total || 0;
            acc.totalAmount += totalValue;
            if (provider === "fastlipa") acc.fastlipaAmount += totalValue;
            if (provider === "bongopay") acc.cardAmount += totalValue;
            return acc;
        }, {
            totalAmount: 0,
            fastlipaAmount: 0,
            cardAmount: 0
        });

        res.json({
            payments,
            total,
            page,
            pages: Math.ceil(total / limit),
            totalAmount: summary.totalAmount,
            fastlipaAmount: summary.fastlipaAmount,
            cardAmount: summary.cardAmount
        });
    } catch (error) {
        console.error("Admin payments error:", error);
        res.status(500).json({ error: "Failed to fetch payments" });
    }
});

/**
 * DELETE /api/admin/payments/:id
 * Delete a payment record
 */
router.delete("/payments/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const payment = await Payment.findByIdAndDelete(req.params.id);
        if (!payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        emitUpdate("admin_payment_deleted", {
            paymentId: payment._id.toString()
        });
        await delKey(ADMIN_STATS_CACHE_KEY);

        res.json({
            success: true,
            message: "Payment deleted",
            paymentId: payment._id.toString()
        });
    } catch (error) {
        console.error("Admin delete payment error:", error);
        res.status(500).json({ error: "Failed to delete payment" });
    }
});

/**
 * POST /api/admin/payments/:id/reconcile
 * Manual settlement fallback when webhook is unreliable.
 */
router.post("/payments/:id/reconcile", authenticate, requireAdmin, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ error: "Payment not found" });

        if (payment.provider === "bongopay") {
            const statusResult = await checkOrderStatus(payment._id.toString());
            const { paymentStatus, reference, data } = extractBongoPayOrderStatus(statusResult);
            const normalizedStatus = String(paymentStatus || "").toUpperCase();

            if (reference) {
                payment.gatewayReference = reference;
            }
            payment.gatewayResponse = {
                ...(payment.gatewayResponse || {}),
                lastManualReconcile: statusResult
            };
            await payment.save();

            if (normalizedStatus === "COMPLETED" || normalizedStatus === "SUCCESSFUL") {
                const result = await settleCompletedPayment(payment._id, { provider: "bongopay", reference, data }, "admin_reconcile_bongopay");
                return res.json({
                    ok: true,
                    action: "completed",
                    state: result.state,
                    paymentId: payment._id,
                    transactionId: reference || payment._id.toString()
                });
            }

            if (normalizedStatus === "FAILED" || normalizedStatus === "REJECTED") {
                const result = await settleFailedPayment(payment._id, "failed", "Card payment failed.", { provider: "bongopay", reference, data });
                return res.json({
                    ok: true,
                    action: "failed",
                    state: result.state,
                    paymentId: payment._id,
                    transactionId: reference || payment._id.toString()
                });
            }

            if (normalizedStatus === "CANCELLED" || normalizedStatus === "USERCANCELLED") {
                const result = await settleFailedPayment(payment._id, "cancelled", "Card payment was cancelled.", { provider: "bongopay", reference, data });
                return res.json({
                    ok: true,
                    action: "failed",
                    state: result.state,
                    paymentId: payment._id,
                    transactionId: reference || payment._id.toString()
                });
            }

            emitUpdate("admin_payment_updated", {
                paymentId: payment._id.toString(),
                status: normalizedStatus || "PENDING"
            });

            return res.json({
                ok: true,
                action: "pending",
                paymentId: payment._id,
                transactionId: reference || payment._id.toString(),
                status: normalizedStatus || "PENDING"
            });
        }

        if (!payment.fastlipaTransactionId) {
            return res.status(400).json({ error: "Payment has no FastLipa transaction ID" });
        }

        const statusResult = await checkTransactionStatus(payment.fastlipaTransactionId);
        const { paymentStatus } = extractFastLipaFields(statusResult);

        if (paymentStatus === "COMPLETED" || paymentStatus === "SUCCESSFUL") {
            const result = await settleCompletedPayment(payment._id, statusResult, "admin_reconcile");
            return res.json({
                ok: true,
                action: "completed",
                state: result.state,
                paymentId: payment._id,
                transactionId: payment.fastlipaTransactionId
            });
        }

        if (["FAILED", "EXPIRED", "CANCELLED", "REJECTED"].includes(paymentStatus)) {
            const failureStatus = paymentStatus === "CANCELLED" || paymentStatus === "REJECTED" ? "cancelled" : "failed";
            const failureReason = failureStatus === "cancelled"
                ? "Payment was cancelled."
                : `Payment failed (${paymentStatus}).`;
            const result = await settleFailedPayment(payment._id, failureStatus, failureReason, statusResult);
            return res.json({
                ok: true,
                action: "failed",
                state: result.state,
                paymentId: payment._id,
                transactionId: payment.fastlipaTransactionId
            });
        }

        await Payment.updateOne(
            { _id: payment._id },
            { $set: { gatewayResponse: { ...(payment.gatewayResponse || {}), lastManualReconcile: statusResult } } }
        );
        emitUpdate("admin_payment_updated", {
            paymentId: payment._id.toString(),
            status: paymentStatus || "PENDING"
        });

        return res.json({
            ok: true,
            action: "pending",
            paymentId: payment._id,
            transactionId: payment.fastlipaTransactionId,
            status: paymentStatus || "PENDING"
        });
    } catch (error) {
        console.error("Admin reconcile payment error:", error);
        res.status(500).json({ error: "Failed to reconcile payment" });
    }
});

/**
 * GET /api/admin/payments/webhook-logs
 * Inspect recent FastLipa webhook deliveries
 */
router.get("/payments/webhook-logs", authenticate, requireAdmin, async (req, res) => {
    try {
        const logs = await FastLipaWebhookLog.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .populate("matchedPaymentId", "fastlipaTransactionId status amount payerPhone");

        res.json({ logs });
    } catch (error) {
        console.error("Admin webhook logs error:", error);
        res.status(500).json({ error: "Failed to fetch webhook logs" });
    }
});

/**
 * GET /api/admin/plans
 * List all plans
 */
router.get("/plans", authenticate, requireAdmin, async (req, res) => {
    try {
        const plans = await Plan.find().sort({ price: 1 });
        res.json({ plans });
    } catch (error) {
        console.error("Admin plans error:", error);
        res.status(500).json({ error: "Failed to fetch plans" });
    }
});

/**
 * POST /api/admin/plans
 * Create a new plan
 */
router.post("/plans", authenticate, requireAdmin, async (req, res) => {
    try {
        const { name, slug, price, currency, coinsAmount, description, isActive } = req.body;

        if (!name || !slug || price === undefined || coinsAmount === undefined) {
            return res.status(400).json({ error: "name, slug, price, and coinsAmount are required" });
        }

        const existing = await Plan.findOne({ $or: [{ slug }, { name }] });
        if (existing) {
            return res.status(409).json({ error: "A plan with this name or slug already exists" });
        }

        const plan = await Plan.create({
            name, slug: slug.toLowerCase(),
            price, currency: currency || "TZS",
            coinsAmount, description: description || "",
            isActive: isActive !== undefined ? isActive : true
        });

        emitUpdate("admin_plan_created", {
            plan
        });
        await delKey(PLANS_CACHE_KEY);

        res.status(201).json({ success: true, plan });
    } catch (error) {
        console.error("Admin create plan error:", error);
        res.status(500).json({ error: "Failed to create plan" });
    }
});

/**
 * PUT /api/admin/plans/:id
 * Update a plan
 */
router.put("/plans/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const plan = await Plan.findById(req.params.id);
        if (!plan) return res.status(404).json({ error: "Plan not found" });

        const { name, slug, price, currency, coinsAmount, description, isActive } = req.body;

        if (name !== undefined) plan.name = name;
        if (slug !== undefined) plan.slug = slug.toLowerCase();
        if (price !== undefined) plan.price = price;
        if (currency !== undefined) plan.currency = currency;
        if (coinsAmount !== undefined) plan.coinsAmount = coinsAmount;
        if (description !== undefined) plan.description = description;
        if (isActive !== undefined) plan.isActive = isActive;

        await plan.save();
        await delKey(PLANS_CACHE_KEY);

        emitUpdate("admin_plan_updated", {
            plan
        });

        res.json({ success: true, plan });
    } catch (error) {
        console.error("Admin update plan error:", error);
        res.status(500).json({ error: "Failed to update plan" });
    }
});

/**
 * DELETE /api/admin/plans/:id
 * Delete a plan
 */
router.delete("/plans/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const plan = await Plan.findByIdAndDelete(req.params.id);
        if (!plan) return res.status(404).json({ error: "Plan not found" });

        emitUpdate("admin_plan_deleted", {
            planId: plan._id.toString()
        });
        await delKey(PLANS_CACHE_KEY);

        res.json({ success: true, message: "Plan deleted" });
    } catch (error) {
        console.error("Admin delete plan error:", error);
        res.status(500).json({ error: "Failed to delete plan" });
    }
});

/**
 * GET /api/admin/sessions
 * List all WhatsApp sessions across all users
 */
router.get("/sessions", authenticate, requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status && ["pairing", "active", "disconnected", "paused", "expired"].includes(status)) {
            filter.status = status;
        }

        const sessions = await WhatsAppSession.find(filter)
            .populate("userId", "email name phone")
            .sort({ lastConnected: -1, createdAt: -1 });

        const enriched = sessions.map(s => ({
            ...s.toJSON(),
            isLive: !!sessionManager?.isConnected(s._id.toString()),
        }));

        res.json({ sessions: enriched, total: enriched.length });
    } catch (error) {
        console.error("Admin sessions error:", error);
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
});

/**
 * POST /api/admin/sessions/:id/disconnect
 * Force-disconnect a session (admin override)
 */
router.post("/sessions/:id/disconnect", authenticate, requireAdmin, async (req, res) => {
    try {
        const session = await WhatsAppSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.status = "disconnected";
        session.autoReconnectDisabled = true;
        session.disconnectIntent = "manual";
        session.lastDisconnectedAt = new Date();
        await session.save();
        await sessionManager.primeSessionRuntimeFromDocument(session);
        await sessionManager.destroySession(session._id.toString());

        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
            status: session.status
        });

        res.json({ success: true, message: "Session disconnected" });
    } catch (error) {
        console.error("Admin disconnect session error:", error);
        res.status(500).json({ error: "Failed to disconnect session" });
    }
});

/**
 * PUT /api/admin/sessions/:id
 * Edit a session (phone, status, expiresAt, and settings)
 */
router.put("/sessions/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const session = await WhatsAppSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found" });

        const { phone, status, expiresAt, settings } = req.body;
        const allowedStatuses = ["pairing", "active", "disconnected", "paused", "expired"];
        const allowedSettings = [
            "prefix", "alwaysOnline", "autoLikeStatus", "autoViewStatus",
            "antiDelete", "antiCall", "antiViewOnce", "antiRemove",
            "autoReadMessages", "alwaysTyping", "alwaysRecording",
            "groupPromotionBroadcast"
        ];

        if (phone !== undefined) {
            session.phone = String(phone).trim();
        }

        if (expiresAt !== undefined) {
            session.expiresAt = expiresAt ? new Date(expiresAt) : null;
        }

        let afterSaveRuntimeAction = null;

        if (status !== undefined) {
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid session status" });
            }
            session.status = status;

            // Apply runtime connection behavior for status changes
            if (status === "disconnected") {
                session.autoReconnectDisabled = true;
                session.disconnectIntent = "manual";
                session.lastDisconnectedAt = new Date();
                afterSaveRuntimeAction = async () => {
                    await sessionManager.destroySession(session._id.toString());
                };
            } else if (status === "paused") {
                session.autoReconnectDisabled = false;
                session.disconnectIntent = "none";
                session.lastDisconnectedAt = null;
                afterSaveRuntimeAction = async () => {
                    if (sessionManager?.isConnected(session._id.toString())) {
                        await sessionManager.pauseSession(session._id.toString());
                    }
                };
            } else if (status === "active") {
                session.autoReconnectDisabled = false;
                session.disconnectIntent = "none";
                session.lastDisconnectedAt = null;
                afterSaveRuntimeAction = async () => {
                    if (sessionManager?.isConnected(session._id.toString())) {
                        await sessionManager.resumeSession(session._id.toString());
                    } else {
                        await sessionManager.connectSession(session._id.toString(), { useReconnectPermit: true, reconnectReason: "admin_activate" });
                    }
                };
            }
        }

        if (settings && typeof settings === "object") {
            for (const key of allowedSettings) {
                if (settings[key] !== undefined) {
                    session.settings[key] = settings[key];
                }
            }
        }

        await session.save();
        await sessionManager.primeSessionRuntimeFromDocument(session);
        if (afterSaveRuntimeAction) {
            await afterSaveRuntimeAction();
        }

        emitToUser(session.userId.toString(), "session_update", {
            sessionId: session._id,
            status: session.status
        });
        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
            status: session.status
        });

        const populated = await WhatsAppSession.findById(session._id)
            .populate("userId", "email name phone");

        res.json({
            success: true,
            message: "Session updated",
            session: populated
        });
    } catch (error) {
        console.error("Admin edit session error:", error);
        res.status(500).json({ error: "Failed to update session" });
    }
});

/**
 * POST /api/admin/group-broadcast/toggle-all
 * Enable or disable group promotion broadcast for all sessions
 */
router.post("/group-broadcast/toggle-all", authenticate, requireAdmin, async (req, res) => {
    try {
        const enabled = req.body?.enabled;
        if (typeof enabled !== "boolean") {
            return res.status(400).json({ error: "enabled must be a boolean" });
        }

        const sessionIds = await WhatsAppSession.find({}).select("_id");
        const result = await WhatsAppSession.updateMany(
            {},
            { $set: { "settings.groupPromotionBroadcast": enabled } }
        );

        for (const session of sessionIds) {
            sessionManager.invalidateConfigCache(session._id.toString());
        }

        emitUpdate("admin_group_broadcast_toggle_all", {
            enabled,
            modifiedCount: result.modifiedCount || 0
        });

        res.json({
            success: true,
            enabled,
            modifiedCount: result.modifiedCount || 0,
            matchedCount: result.matchedCount || 0
        });
    } catch (error) {
        console.error("Admin toggle all group broadcasts error:", error);
        res.status(500).json({ error: "Failed to update group broadcast setting for all sessions" });
    }
});

/**
 * POST /api/admin/group-broadcast/manual
 * Trigger manual group broadcast for one, many, or all eligible sessions
 */
router.post("/group-broadcast/manual", authenticate, requireAdmin, async (req, res) => {
    try {
        const sessionIds = Array.isArray(req.body.sessionIds)
            ? req.body.sessionIds.filter(Boolean)
            : [];
        const targetAll = req.body.targetAll === true;
        if (!targetAll && sessionIds.length === 0) {
            return res.status(400).json({ error: "Select one or more sessions, or set targetAll=true." });
        }
        const now = new Date();

        const filter = {
            status: { $in: ["active", "paused"] },
            expiresAt: { $gt: now },
            ...(targetAll ? {} : { _id: { $in: sessionIds } })
        };

        const sessions = await WhatsAppSession.find(filter).select("_id status phone expiresAt settings");
        const groupDelayMs = Number(req.body.groupDelayMs || 60_000);

        let triggered = 0;
        let totalSkipped = 0;
        const queuedSessions = [];
        const dispatchSessions = [];

        for (const session of sessions) {
            const sid = session._id.toString();
            const isSkipped = session.settings?.groupPromotionBroadcast !== true;
            if (isSkipped) {
                totalSkipped += 1;
                continue;
            }
            triggered += 1;
            dispatchSessions.push(session);
            queuedSessions.push({
                sessionId: sid,
                phone: session.phone || ""
            });
        }

        setImmediate(async () => {
            let totalSent = 0;
            let totalFailed = 0;
            let totalGroups = 0;
            const perSession = [];

            for (const session of dispatchSessions) {
                const sid = session._id.toString();
                try {
                    if (!sessionManager.isConnected(sid)) {
                        await sessionManager.connectSession(sid, { useReconnectPermit: true, reconnectReason: "manual_broadcast" });
                    }

                    const result = await sessionManager.sendGroupPromotionBroadcast(sid, {
                        groupDelayMs,
                        ignoreScheduleSetting: true
                    });

                    totalSent += Number(result?.sent || 0);
                    totalFailed += Number(result?.failed || 0);
                    totalGroups += Number(result?.total || 0);
                    perSession.push({
                        sessionId: sid,
                        phone: session.phone || "",
                        sent: Number(result?.sent || 0),
                        failed: Number(result?.failed || 0),
                        total: Number(result?.total || 0)
                    });
                } catch (error) {
                    totalFailed += 1;
                    perSession.push({
                        sessionId: sid,
                        phone: session.phone || "",
                        sent: 0,
                        failed: 1,
                        total: 0,
                        error: error.message
                    });
                    console.warn(`[AdminGroupBroadcast] Manual trigger failed for ${sid}:`, error.message);
                }
            }

            emitUpdate("admin_group_broadcast_triggered", {
                targetAll,
                sessionIds: dispatchSessions.map(s => s._id.toString()),
                triggered,
                totalGroups,
                totalSent,
                totalFailed,
                totalSkipped,
                perSession
            });
        });

        res.json({
            success: true,
            targetAll,
            selectedCount: targetAll ? sessions.length : sessionIds.length,
            triggered,
            totalGroups: 0,
            totalSent: 0,
            totalFailed: 0,
            totalSkipped,
            queued: true,
            perSession: queuedSessions
        });
    } catch (error) {
        console.error("Admin manual group broadcast error:", error);
        res.status(500).json({ error: "Failed to trigger manual group broadcast" });
    }
});

/**
 * DELETE /api/admin/sessions/:id
 * Delete a session permanently
 */
router.delete("/sessions/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const session = await WhatsAppSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found" });

        await sessionManager.destroySession(session._id.toString());
        await WhatsAppSession.deleteOne({ _id: session._id });

        emitToUser(session.userId.toString(), "session_deleted", {
            sessionId: session._id
        });
        emitUpdate("admin_session_deleted", {
            sessionId: session._id.toString()
        });

        res.json({ success: true, message: "Session deleted", sessionId: session._id.toString() });
    } catch (error) {
        console.error("Admin delete session error:", error);
        res.status(500).json({ error: "Failed to delete session" });
    }
});

/**
 * POST /api/admin/users/:id/coins
 * Adjust user's coin balance (add or subtract)
 * Body: { amount: number, reason?: string }
 */
router.post("/users/:id/coins", authenticate, requireAdmin, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        if (amount === undefined || amount === 0) {
            return res.status(400).json({ error: "Amount is required and cannot be zero" });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const newBalance = user.coins + amount;
        if (newBalance < 0) {
            return res.status(400).json({ error: `Insufficient coins. User has ${user.coins}, cannot remove ${Math.abs(amount)}` });
        }

        user.coins = newBalance;
        await user.save();
        await delKey(ADMIN_STATS_CACHE_KEY);
        emitToUser(user._id, "balance_update", { coins: user.coins });

        // Notify user about coin adjustment
        try {
            await Notification.create({
                userId: user._id,
                title: "Balance Adjusted 🪙",
                message: `Your coin balance has been ${amount > 0 ? "credited with" : "debited by"} ${Math.abs(amount)} coins. Reason: ${reason || "Admin adjustment"}.`,
                type: amount > 0 ? "info" : "warning"
            });
            emitToUser(user._id, "new_notification", notification);
        } catch (err) {
            console.error("Failed to create admin coin notification:", err);
        }

        res.json({
            success: true,
            previousBalance: user.coins - amount,
            newBalance: user.coins,
            adjustment: amount,
            reason: reason || "Admin adjustment",
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Admin coin adjustment error:", error);
        res.status(500).json({ error: "Failed to adjust coins" });
    }
});

/**
 * POST /api/admin/users/bonus-all
 * Award bonus coins to ALL registered users at once
 * Body: { amount: number, reason: string, message?: string }
 */
router.post("/users/bonus-all", authenticate, requireAdmin, async (req, res) => {
    try {
        const { amount, reason, message } = req.body;
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: "Amount must be a positive number" });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: "A reason is required for the global bonus" });
        }

        const coins = Number(amount);
        const allUsers = await User.find({ isBanned: false }, { _id: 1, name: 1 }).lean();

        if (allUsers.length === 0) {
            return res.status(400).json({ error: "No eligible users found" });
        }

        // 1. Bulk increment coins for all users
        await User.updateMany({ isBanned: false }, { $inc: { coins } });

        // Notify all connected users of the balance change
        const updatedUsers = await User.find({ isBanned: false }, { _id: 1, coins: 1 }).lean();
        updatedUsers.forEach(u => {
            emitToUser(u._id, "balance_update", { coins: u.coins });
        });

        // 2. Create personalised notifications for all users
        const now = new Date();
        const notificationMessage = message?.trim()
            ? message.trim()
            : `🎉 Exciting news! You've received a bonus of ${coins} coins 🪙 from the Tervux Team! Reason: ${reason.trim()}. Your new balance has been updated automatically. Thank you for being part of our community! — Tervux Team`;

        const notifications = allUsers.map(u => ({
            userId: u._id,
            title: `🎁 Bonus Received: +${coins} Coins!`,
            message: notificationMessage,
            type: "success",
            createdAt: now
        }));

        await Notification.insertMany(notifications);

        console.log(`💰 [BonusAll] Admin gave +${coins} coins to ${allUsers.length} users. Reason: ${reason}`);

        res.json({
            success: true,
            usersRewarded: allUsers.length,
            coinsPerUser: coins,
            totalCoinsDistributed: coins * allUsers.length,
            reason
        });
    } catch (error) {
        console.error("Bonus-all error:", error);
        res.status(500).json({ error: "Failed to distribute bonus" });
    }
});

/**
 * GET /api/admin/announcements
 * List all announcements
 */
router.get("/announcements", authenticate, requireAdmin, async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });
        res.json({ announcements });
    } catch (error) {
        console.error("Admin announcements error:", error);
        res.status(500).json({ error: "Failed to fetch announcements" });
    }
});

/**
 * POST /api/admin/announcements
 * Create a new announcement
 */
router.post("/announcements", authenticate, requireAdmin, async (req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: "Title and message are required" });
        }

        const announcement = await Announcement.create({
            title, message,
            type: type || "info",
            createdBy: req.user._id
        });

        const populated = await announcement.populate("createdBy", "name email");
        await delKey(ANNOUNCEMENTS_CACHE_KEY_PATTERN);
        res.status(201).json({ success: true, announcement: populated });
    } catch (error) {
        console.error("Admin create announcement error:", error);
        res.status(500).json({ error: "Failed to create announcement" });
    }
});

/**
 * PUT /api/admin/announcements/:id
 * Update announcement (toggle active, edit content)
 */
router.put("/announcements/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });

        const { title, message, type, isActive } = req.body;
        if (title !== undefined) announcement.title = title;
        if (message !== undefined) announcement.message = message;
        if (type !== undefined) announcement.type = type;
        if (isActive !== undefined) announcement.isActive = isActive;

        await announcement.save();
        const populated = await announcement.populate("createdBy", "name email");
        await delKey(ANNOUNCEMENTS_CACHE_KEY_PATTERN);
        res.json({ success: true, announcement: populated });
    } catch (error) {
        console.error("Admin update announcement error:", error);
        res.status(500).json({ error: "Failed to update announcement" });
    }
});

/**
 * DELETE /api/admin/announcements/:id
 * Delete an announcement
 */
router.delete("/announcements/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const announcement = await Announcement.findByIdAndDelete(req.params.id);
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });
        await delKey(ANNOUNCEMENTS_CACHE_KEY_PATTERN);
        res.json({ success: true, message: "Announcement deleted" });
    } catch (error) {
        console.error("Admin delete announcement error:", error);
        res.status(500).json({ error: "Failed to delete announcement" });
    }
});

/**
 * GET /api/admin/tutorials
 * List all tutorials for admin CRUD
 */
router.get("/tutorials", authenticate, requireAdmin, async (_req, res) => {
    try {
        const tutorials = await TutorialVideo.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.json({ tutorials });
    } catch (error) {
        console.error("Admin tutorials error:", error);
        res.status(500).json({ error: "Failed to fetch tutorials" });
    }
});

/**
 * POST /api/admin/tutorials
 * Create a tutorial video
 */
router.post("/tutorials", authenticate, requireAdmin, async (req, res) => {
    try {
        const title = sanitize(req.body.title);
        const description = sanitize(req.body.description);
        const youtubeUrl = String(req.body.youtubeUrl || "").trim();
        const youtubeVideoId = extractYoutubeVideoId(youtubeUrl);

        if (!title || !youtubeUrl) {
            return res.status(400).json({ error: "Title and YouTube link are required" });
        }

        if (!youtubeVideoId) {
            return res.status(400).json({ error: "Please provide a valid YouTube or Shorts link" });
        }

        const tutorial = await TutorialVideo.create({
            title,
            description,
            youtubeUrl,
            youtubeVideoId,
            isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
            createdBy: req.user._id
        });

        const populated = await tutorial.populate("createdBy", "name email");

        emitUpdate("admin_tutorial_created", { tutorial: populated });
        emitUpdate("tutorials_updated", { action: "created", tutorial: populated });
        await delKey(TUTORIALS_CACHE_KEY);

        res.status(201).json({ success: true, tutorial: populated });
    } catch (error) {
        console.error("Admin create tutorial error:", error);
        res.status(500).json({ error: "Failed to create tutorial" });
    }
});

/**
 * PUT /api/admin/tutorials/:id
 * Update tutorial video
 */
router.put("/tutorials/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const tutorial = await TutorialVideo.findById(req.params.id);
        if (!tutorial) return res.status(404).json({ error: "Tutorial not found" });

        if (req.body.title !== undefined) tutorial.title = sanitize(req.body.title);
        if (req.body.description !== undefined) tutorial.description = sanitize(req.body.description);
        if (req.body.isActive !== undefined) tutorial.isActive = !!req.body.isActive;
        if (req.body.youtubeUrl !== undefined) {
            const youtubeUrl = String(req.body.youtubeUrl || "").trim();
            const youtubeVideoId = extractYoutubeVideoId(youtubeUrl);
            if (!youtubeVideoId) {
                return res.status(400).json({ error: "Please provide a valid YouTube or Shorts link" });
            }
            tutorial.youtubeUrl = youtubeUrl;
            tutorial.youtubeVideoId = youtubeVideoId;
        }

        if (!tutorial.title) {
            return res.status(400).json({ error: "Title is required" });
        }

        await tutorial.save();
        const populated = await tutorial.populate("createdBy", "name email");

        if (!tutorial.isActive) {
            const settings = await getSettings();
            if (String(settings.tutorialBannerTutorialId || "") === tutorial._id.toString()) {
                settings.tutorialBannerTutorialId = null;
                settings.lastUpdatedBy = req.user._id;
                await settings.save();
                await invalidateSettingsCache();
                emitPlatformSettingsUpdate(settings);
            }
        }

        emitUpdate("admin_tutorial_updated", { tutorial: populated });
        emitUpdate("tutorials_updated", { action: "updated", tutorial: populated });
        await delKey(TUTORIALS_CACHE_KEY);

        res.json({ success: true, tutorial: populated });
    } catch (error) {
        console.error("Admin update tutorial error:", error);
        res.status(500).json({ error: "Failed to update tutorial" });
    }
});

/**
 * DELETE /api/admin/tutorials/:id
 * Delete tutorial video
 */
router.delete("/tutorials/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const tutorial = await TutorialVideo.findByIdAndDelete(req.params.id);
        if (!tutorial) return res.status(404).json({ error: "Tutorial not found" });

        const settings = await getSettings();
        if (String(settings.tutorialBannerTutorialId || "") === tutorial._id.toString()) {
            settings.tutorialBannerTutorialId = null;
            settings.lastUpdatedBy = req.user._id;
            await settings.save();
            await invalidateSettingsCache();
            emitPlatformSettingsUpdate(settings);
        }

        emitUpdate("admin_tutorial_deleted", { tutorialId: tutorial._id.toString() });
        emitUpdate("tutorials_updated", { action: "deleted", tutorialId: tutorial._id.toString() });
        await delKey(TUTORIALS_CACHE_KEY);

        res.json({ success: true, tutorialId: tutorial._id.toString() });
    } catch (error) {
        console.error("Admin delete tutorial error:", error);
        res.status(500).json({ error: "Failed to delete tutorial" });
    }
});

/**
 * GET /api/admin/settings
 * Fetch current platform configurations
 */
router.get("/settings", authenticate, requireAdmin, async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({ settings });
    } catch (error) {
        console.error("Admin fetch settings error:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

/**
 * PUT /api/admin/settings
 * Update platform configurations
 */
router.put("/settings", authenticate, requireAdmin, async (req, res) => {
    try {
        const {
            maintenanceMode,
            registrationEnabled,
            supportPhone,
            siteName,
            commandFooter,
            kingBonusCoins,
            referralBonus,
            dailyClaimBannerEnabled,
            tutorialBannerEnabled,
            tutorialBannerTutorialId
        } = req.body;
        const settings = await getSettings();

        const oldKingBonus = settings.kingBonusCoins;
        const oldReferralBonus = settings.referralBonus;

        if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
        if (registrationEnabled !== undefined) settings.registrationEnabled = registrationEnabled;
        if (supportPhone !== undefined) settings.supportPhone = supportPhone;
        if (siteName !== undefined) settings.siteName = siteName;
        if (commandFooter !== undefined && String(commandFooter).trim()) settings.commandFooter = String(commandFooter);
        if (kingBonusCoins !== undefined && Number(kingBonusCoins) > 0) settings.kingBonusCoins = Number(kingBonusCoins);
        if (referralBonus !== undefined && Number(referralBonus) > 0) settings.referralBonus = Number(referralBonus);
        if (dailyClaimBannerEnabled !== undefined) settings.dailyClaimBannerEnabled = !!dailyClaimBannerEnabled;
        if (tutorialBannerEnabled !== undefined) settings.tutorialBannerEnabled = !!tutorialBannerEnabled;
        if (tutorialBannerTutorialId !== undefined) {
            if (!tutorialBannerTutorialId) {
                settings.tutorialBannerTutorialId = null;
            } else if (mongoose.Types.ObjectId.isValid(String(tutorialBannerTutorialId))) {
                const tutorial = await TutorialVideo.findOne({
                    _id: tutorialBannerTutorialId,
                    isActive: true
                }).select("_id");

                if (!tutorial) {
                    return res.status(400).json({ error: "Selected tutorial must be active before it can appear on the dashboard banner" });
                }

                settings.tutorialBannerTutorialId = tutorial._id;
            } else {
                return res.status(400).json({ error: "Invalid tutorial selected for dashboard banner" });
            }
        }

        settings.lastUpdatedBy = req.user._id;
        await settings.save();
        await invalidateSettingsCache();
        await getCachedPublicSettings();

        emitPlatformSettingsUpdate(settings);

        // Broadcast notification for coin changes
        const kingBonusChanged = oldKingBonus !== settings.kingBonusCoins;
        const referralBonusChanged = oldReferralBonus !== settings.referralBonus;

        if (kingBonusChanged || referralBonusChanged) {
            const allUsers = await User.find({ isBanned: false }, { _id: 1 }).lean();
            if (allUsers.length > 0) {
                let message = "Habari, tumefanya mabadiliko kwenye mfumo wetu wa zawadi! 🪙\n\n";
                let messageEn = "We've updated our rewards system! 🪙\n\n";

                if (kingBonusChanged) {
                    message += `• Bonasi ya Mfalme wa Wiki sasa ni sarafu ${settings.kingBonusCoins} 👑\n`;
                    messageEn += `• The Weekly Referral King bonus is now ${settings.kingBonusCoins} coins 👑\n`;
                }
                if (referralBonusChanged) {
                    message += `• Zawadi kwa kila mwaliko uliofanikiwa sasa ni sarafu ${settings.referralBonus} 🎁\n`;
                    messageEn += `• The reward for each successful referral is now ${settings.referralBonus} coins 🎁\n`;
                }

                message += "\nAsante kwa kuendelea nasi! Endelea kualika na kupata zaidi. — Tervux Team";
                messageEn += "\nThank you for being a part of Tervux Cloud! Keep sharing and earning. — Tervux Team";

                const notifications = allUsers.map(u => ({
                    userId: u._id,
                    title: "System Update: Rewards Adjusted 🪙",
                    message: messageEn, // Using English for the main message object, but could consider language-specific later
                    type: "info"
                }));

                await Notification.insertMany(notifications);
                console.log(`📢 [Admin] Broadcasted coin update to ${allUsers.length} users.`);
            }
        }

        res.json({ success: true, settings });
    } catch (error) {
        console.error("Admin update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

/**
 * GET /api/admin/referral/overview
 * Full referral data overview for admin
 */
router.get("/referral/overview", authenticate, requireAdmin, async (req, res) => {
    try {
        const settings = await getSettings();

        const [leaderboard, currentKing, totalReferrals, topWeekly] = await Promise.all([
            // All-time top referrers
            User.aggregate([
                { $match: { referredBy: { $ne: null }, referredByPaid: true } },
                { $group: { _id: "$referredBy", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
                { $unwind: "$u" },
                { $project: { _id: 1, count: 1, name: "$u.name", email: "$u.email", isReferralKing: "$u.isReferralKing", weeklyReferralCount: "$u.weeklyReferralCount" } }
            ]),
            // Current king
            User.findOne({ isReferralKing: true }).select("name email referralKingSince coins"),
            // Total referrals across platform
            User.countDocuments({ referredBy: { $ne: null }, referredByPaid: true }),
            // This week's top referrer
            User.findOne({ weeklyReferralCount: { $gt: 0 } }).sort({ weeklyReferralCount: -1 }).select("name email weeklyReferralCount")
        ]);

        res.json({
            leaderboard,
            currentKing,
            totalReferrals,
            topWeekly,
            kingBonusCoins: settings.kingBonusCoins,
            referralBonus: settings.referralBonus
        });
    } catch (error) {
        console.error("Admin referral overview error:", error);
        res.status(500).json({ error: "Failed to fetch referral overview" });
    }
});

/**
 * POST /api/admin/referral/trigger-ceremony
 * Manually trigger the weekly king ceremony (for testing or emergency)
 */
router.post("/referral/trigger-ceremony", authenticate, requireAdmin, async (req, res) => {
    try {
        const { runWeeklyKingCeremony } = await import("../services/referralKingService.js");
        await runWeeklyKingCeremony();
        res.json({ success: true, message: "King ceremony completed successfully." });
    } catch (error) {
        console.error("Trigger ceremony error:", error);
        res.status(500).json({ error: "Failed to trigger king ceremony" });
    }
});

/**
 * POST /api/admin/referral/reset-weekly
 * Reset all weekly referral counts manually
 */
router.post("/referral/reset-weekly", authenticate, requireAdmin, async (req, res) => {
    try {
        await User.updateMany({}, { weeklyReferralCount: 0 });
        res.json({ success: true, message: "Weekly counts reset." });
    } catch (error) {
        console.error("Reset weekly error:", error);
        res.status(500).json({ error: "Failed to reset weekly counts" });
    }
});

/**
 * DELETE /api/admin/referral/dethrone
 * Dethrone the current king without crowning a new one
 */
router.delete("/referral/dethrone", authenticate, requireAdmin, async (req, res) => {
    try {
        await User.updateMany({ isReferralKing: true }, { isReferralKing: false, referralKingSince: null });
        res.json({ success: true, message: "King dethroned." });
    } catch (error) {
        console.error("Dethrone error:", error);
        res.status(500).json({ error: "Failed to dethrone king" });
    }
});

/**
 * POST /api/admin/users/:id/gamification
 * Update a user's badges and VIP status
 */
router.post("/users/:id/gamification", authenticate, requireAdmin, async (req, res) => {
    try {
        const { badges, isVIP } = req.body;

        let updateData = {};
        if (Array.isArray(badges)) updateData.badges = badges;
        if (typeof isVIP === 'boolean') updateData.isVIP = isVIP;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ error: "User not found" });

        const serializedUser = updatedUser.toJSON();
        emitUpdate("admin_user_updated", {
            user: serializedUser
        });

        emitToUser(updatedUser._id, "account_gamification_updated", {
            badges: serializedUser.badges,
            isVIP: serializedUser.isVIP
        });

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Admin gamification update error:", error);
        res.status(500).json({ error: "Failed to update user gamification data" });
    }
});

export default router;
