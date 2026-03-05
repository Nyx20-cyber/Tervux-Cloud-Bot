import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Announcement from "../models/Announcement.js";
import Notification from "../models/Notification.js";
import SystemSettings, { getSettings } from "../models/SystemSettings.js";
import { sessionManager } from "../services/whatsappService.js";

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
            WhatsAppSession.countDocuments({ "subscription.status": "active" }),
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

        res.json({
            users: users.map(u => u.toJSON()),
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
 * Update user (ban, change role, extend subscription etc.)
 */
router.put("/users/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const { isBanned, role, subscriptionExtendDays } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (isBanned !== undefined) user.isBanned = isBanned;
        if (role && ["user", "admin"].includes(role)) user.role = role;

        if (subscriptionExtendDays && user.subscription?.expiresAt) {
            const current = new Date(user.subscription.expiresAt);
            const base = current > new Date() ? current : new Date();
            user.subscription.expiresAt = new Date(base.getTime() + subscriptionExtendDays * 86400000);
            user.subscription.status = "active";
        }

        await user.save();

        // If banned, disconnect their sessions
        if (isBanned) {
            const sessions = await WhatsAppSession.find({ userId: user._id, status: "active" });
            for (const session of sessions) {
                await sessionManager.disconnectSession(session._id.toString());
                session.status = "disconnected";
                await session.save();
            }
        }

        res.json({ success: true, user: user.toJSON() });
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
        const { name, slug, price, currency, durationDays, coinsAmount, description, isActive } = req.body;

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
            durationDays: durationDays || 0,
            coinsAmount, description: description || "",
            isActive: isActive !== undefined ? isActive : true
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

        const { name, slug, price, currency, durationDays, coinsAmount, description, isActive } = req.body;

        if (name !== undefined) plan.name = name;
        if (slug !== undefined) plan.slug = slug.toLowerCase();
        if (price !== undefined) plan.price = price;
        if (currency !== undefined) plan.currency = currency;
        if (durationDays !== undefined) plan.durationDays = durationDays;
        if (coinsAmount !== undefined) plan.coinsAmount = coinsAmount;
        if (description !== undefined) plan.description = description;
        if (isActive !== undefined) plan.isActive = isActive;

        await plan.save();
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
            .populate("subscription.planId", "name price")
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

        res.json({ success: true, message: "Session disconnected" });
    } catch (error) {
        console.error("Admin disconnect session error:", error);
        res.status(500).json({ error: "Failed to disconnect session" });
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

        // Notify user about coin adjustment
        try {
            await Notification.create({
                userId: user._id,
                title: "Balance Adjusted 🪙",
                message: `Your coin balance has been ${amount > 0 ? "credited with" : "debited by"} ${Math.abs(amount)} coins. Reason: ${reason || "Admin adjustment"}.`,
                type: amount > 0 ? "info" : "warning"
            });
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
        const { maintenanceMode, registrationEnabled, supportPhone, siteName } = req.body;
        const settings = await getSettings();

        if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
        if (registrationEnabled !== undefined) settings.registrationEnabled = registrationEnabled;
        if (supportPhone !== undefined) settings.supportPhone = supportPhone;
        if (siteName !== undefined) settings.siteName = siteName;

        settings.lastUpdatedBy = req.user._id;
        await settings.save();

        res.json({ success: true, settings });
    } catch (error) {
        console.error("Admin update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

export default router;
