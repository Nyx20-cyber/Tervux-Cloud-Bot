import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Payment from "../models/Payment.js";
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
                .populate("subscription.planId", "name price durationDays")
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

export default router;
