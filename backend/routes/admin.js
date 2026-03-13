import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Announcement from "../models/Announcement.js";
import Notification from "../models/Notification.js";
import SystemSettings, { getCachedPublicSettings, getSettings, invalidateSettingsCache } from "../models/SystemSettings.js";
import FastLipaWebhookLog from "../models/FastLipaWebhookLog.js";
import { sessionManager } from "../services/whatsappService.js";
import { emitToUser, emitUpdate } from "../services/socketService.js";
import { checkTransactionStatus } from "../services/paymentService.js";
import { extractFastLipaFields, settleCompletedPayment, settleFailedPayment } from "../services/paymentSettlement.js";

const router = Router();

/**
 * GET /api/admin/stats
 * Platform analytics
 */
router.get("/stats", authenticate, requireAdmin, async (req, res) => {
    try {
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

        res.json({
            totalUsers,
            activeSubscriptions,
            totalSessions,
            activeSessions,
            liveConnections: sessionManager?.getActiveCount() || 0,
            totalRevenue: totalRevenue[0]?.total || 0,
            currency: "TZS",
            recentPayments
        });
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
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments()
        ]);

        const usersData = users.map((u) => u.toJSON());
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
            pages: Math.ceil(total / limit)
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
            const sessions = await WhatsAppSession.find({ userId: user._id, status: "active" });
            for (const session of sessions) {
                await sessionManager.disconnectSession(session._id.toString());
                session.status = "disconnected";
                await session.save();
            }
        }

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Admin update user error:", error);
        res.status(500).json({ error: "Failed to update user" });
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
        const { status, search } = req.query;

        const filter = {};
        if (status && ["pending", "completed", "failed", "cancelled"].includes(status)) {
            filter.status = status;
        }
        if (search) {
            filter.$or = [
                { payerPhone: { $regex: search, $options: "i" } },
                { fastlipaTransactionId: { $regex: search, $options: "i" } }
            ];
        }

        const [payments, total, totalAmount] = await Promise.all([
            Payment.find(filter)
                .populate("userId", "email name phone")
                .populate("planId", "name price coinsAmount")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Payment.countDocuments(filter),
            Payment.aggregate([
                { $match: { ...filter, status: "completed" } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ])
        ]);

        res.json({
            payments,
            total,
            page,
            pages: Math.ceil(total / limit),
            totalAmount: totalAmount[0]?.total || 0
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

        await sessionManager.disconnectSession(session._id.toString());
        session.status = "disconnected";
        await session.save();

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
            "autoReadMessages", "alwaysTyping", "alwaysRecording"
        ];

        if (phone !== undefined) {
            session.phone = String(phone).trim();
        }

        if (expiresAt !== undefined) {
            session.expiresAt = expiresAt ? new Date(expiresAt) : null;
        }

        if (status !== undefined) {
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid session status" });
            }
            session.status = status;

            // Apply runtime connection behavior for status changes
            if (status === "disconnected") {
                await sessionManager.disconnectSession(session._id.toString());
            } else if (status === "paused") {
                if (sessionManager?.isConnected(session._id.toString())) {
                    await sessionManager.pauseSession(session._id.toString());
                }
            } else if (status === "active") {
                if (sessionManager?.isConnected(session._id.toString())) {
                    await sessionManager.resumeSession(session._id.toString());
                } else {
                    sessionManager.connectSession(session._id.toString());
                }
            }
        }

        if (settings && typeof settings === "object") {
            for (const key of allowedSettings) {
                if (settings[key] !== undefined) {
                    session.settings[key] = settings[key];
                }
            }
            sessionManager.invalidateConfigCache(session._id.toString());
        }

        await session.save();

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
        res.json({ success: true, message: "Announcement deleted" });
    } catch (error) {
        console.error("Admin delete announcement error:", error);
        res.status(500).json({ error: "Failed to delete announcement" });
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
        const { maintenanceMode, registrationEnabled, supportPhone, siteName, commandFooter, kingBonusCoins, referralBonus } = req.body;
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

        settings.lastUpdatedBy = req.user._id;
        await settings.save();
        await invalidateSettingsCache();
        await getCachedPublicSettings();

        emitUpdate("admin_settings_updated", { settings });
        emitUpdate("platform_settings_updated", {
            maintenanceMode: settings.maintenanceMode,
            registrationEnabled: settings.registrationEnabled,
            supportPhone: settings.supportPhone,
            siteName: settings.siteName,
            commandFooter: settings.commandFooter,
            kingBonusCoins: settings.kingBonusCoins,
            referralBonus: settings.referralBonus
        });

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



