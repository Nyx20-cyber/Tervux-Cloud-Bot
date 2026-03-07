import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import User from "../models/User.js";
import crypto from "crypto";
import { getSettings } from "../models/SystemSettings.js";

const router = Router();

/**
 * GET /api/referral
 * Get current user's referral info
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const settings = await getSettings();
        const referralCount = await User.countDocuments({ referredBy: req.user._id, referredByPaid: true });

        res.json({
            referralCode: user.referralCode || null,
            referralCodeExpiresAt: user.referralCodeExpiresAt || null,
            referralCount,
            kingBonusCoins: settings.kingBonusCoins || 100,
            referralBonus: settings.referralBonus || 10
        });
    } catch (error) {
        console.error("Fetch referral error:", error);
        res.status(500).json({ error: "Failed to fetch referral info" });
    }
});

/**
 * POST /api/referral/generate
 * Generate a new referral code (valid for 7 days)
 */
router.post("/generate", authenticate, async (req, res) => {
    try {
        const userCheck = await User.findById(req.user._id);

        // Check if a code already exists or was already generated
        if (userCheck.hasGeneratedCode || userCheck.referralCode) {
            return res.status(400).json({
                error: "You already have a referral code. Codes are permanent."
            });
        }

        // Generate a random 8-character uppercase string
        const newCode = crypto.randomBytes(4).toString("hex").toUpperCase();

        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                referralCode: newCode,
                referralCodeExpiresAt: null,
                hasGeneratedCode: true
            },
            { new: true }
        );

        res.json({
            success: true,
            referralCode: user.referralCode,
            referralCodeExpiresAt: user.referralCodeExpiresAt
        });
    } catch (error) {
        console.error("Referral generation error:", error);
        res.status(500).json({ error: "Failed to generate referral code" });
    }
});

/**
 * GET /api/referral/leaderboard
 * Global list of top referrers
 */
router.get("/leaderboard", authenticate, async (req, res) => {
    try {
        const leaderboard = await User.aggregate([
            { $match: { referredBy: { $ne: null }, referredByPaid: true } },
            { $group: { _id: "$referredBy", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            { $unwind: "$userDetails" },
            {
                $project: {
                    _id: 1,
                    count: 1,
                    name: "$userDetails.name",
                    isReferralKing: "$userDetails.isReferralKing",
                    referralKingSince: "$userDetails.referralKingSince"
                }
            }
        ]);

        res.json({ leaderboard });
    } catch (error) {
        console.error("Leaderboard error:", error);
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});

/**
 * GET /api/referral/king
 * Get the current Referral King
 */
router.get("/king", authenticate, async (req, res) => {
    try {
        const king = await User.findOne({ isReferralKing: true }).select("name referralKingSince");
        res.json({ king: king || null });
    } catch (error) {
        console.error("King fetch error:", error);
        res.status(500).json({ error: "Failed to fetch king" });
    }
});

export default router;
