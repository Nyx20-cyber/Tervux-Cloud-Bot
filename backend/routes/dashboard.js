import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { getJson, setJson } from "../lib/redis.js";

const router = Router();
const DASHBOARD_STATS_CACHE_TTL_SECONDS = Number(process.env.DASHBOARD_STATS_CACHE_TTL_SECONDS || 30);
const getDashboardStatsCacheKey = (userId) => `dashboard:stats:${userId}`;

/**
 * GET /api/dashboard/stats
 * Real-time stats for user dashboard charts
 */
router.get("/stats", authenticate, async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = getDashboardStatsCacheKey(userId);
        const cached = await getJson(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Calculate the last 7 days window
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Today and 6 previous days

        // 1. Referral Growth (last 7 days)
        const referralStats = await User.aggregate([
            {
                $match: {
                    referredBy: userId,
                    referredByPaid: true,
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // 2. Coin Purchasing Trend (last 7 days)
        const coinStats = await Payment.aggregate([
            {
                $match: {
                    userId: userId,
                    status: "completed",
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Format data to ensure all 7 days are present for smooth charting
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo);
            d.setDate(d.getDate() + i);
            days.push(d.toISOString().split('T')[0]);
        }

        const formattedReferrals = days.map(day => ({
            date: new Date(day).toLocaleDateString("en-US", { weekday: 'short' }),
            count: referralStats.find(s => s._id === day)?.count || 0
        }));

        const formattedCoins = days.map(day => ({
            date: new Date(day).toLocaleDateString("en-US", { weekday: 'short' }),
            amount: coinStats.find(s => s._id === day)?.total || 0
        }));

        const payload = {
            referralGrowth: formattedReferrals,
            coinUsage: formattedCoins,
            summary: {
                totalCoins: req.user.coins || 0,
                referralCount: await User.countDocuments({ referredBy: userId, referredByPaid: true })
            }
        };

        await setJson(cacheKey, payload, DASHBOARD_STATS_CACHE_TTL_SECONDS);
        res.json(payload);
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

export default router;
