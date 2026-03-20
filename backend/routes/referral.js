import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import User from "../models/User.js";
import crypto from "crypto";
import { getSettings } from "../models/SystemSettings.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter for code generation: 3 attempts per 10 minutes per IP
const generateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many code generation attempts. Please try again later." }
});

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
            referralCount,
            referralCoinsEarned: user.totalReferralCoinsEarned || 0,
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
 * Generate a permanent referral code (one per user)
 */
router.post("/generate", authenticate, generateLimiter, async (req, res) => {
    try {
        // Generate and assign atomically to avoid races across concurrent requests.
        const MAX_RETRIES = 10;
        for (let i = 0; i < MAX_RETRIES; i++) {
            const candidate = crypto.randomBytes(6).toString("hex").toUpperCase();
            try {
                const user = await User.findOneAndUpdate(
                    {
                        _id: req.user._id,
                        hasGeneratedCode: false,
                        $or: [
                            { referralCode: null },
                            { referralCode: "" },
                            { referralCode: { $exists: false } }
                        ]
                    },
                    {
                        $set: {
                            referralCode: candidate,
                            hasGeneratedCode: true
                        }
                    },
                    { returnDocument: "after" }
                );

                if (user) {
                    return res.json({
                        success: true,
                        referralCode: user.referralCode
                    });
                }

                // User already has a permanent code.
                const existingUser = await User.findById(req.user._id).select("referralCode hasGeneratedCode");
                if (existingUser?.hasGeneratedCode || (existingUser?.referralCode || "").trim().length > 0) {
                    return res.status(400).json({
                        error: "You already have a referral code. Codes are permanent."
                    });
                }
            } catch (error) {
                // Duplicate code from unique index race/collision, retry with a new candidate.
                if (error?.code === 11000 && error?.keyPattern?.referralCode) {
                    continue;
                }
                throw error;
            }
        }

        return res.status(500).json({ error: "Failed to generate a unique code. Please try again." });
    } catch (error) {
        console.error("Referral generation error:", error);
        res.status(500).json({ error: "Failed to generate referral code" });
    }
});

/**
 * GET /api/referral/leaderboard
 * Global list of top referrers (anonymized — no internal IDs exposed)
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
                    _id: 0,
                    count: 1,
                    name: "$userDetails.name",
                    isReferralKing: "$userDetails.isReferralKing",
                    referralKingSince: "$userDetails.referralKingSince"
                }
            }
        ]);

        // Add a rank field for stable client-side keying
        const ranked = leaderboard.map((item, i) => ({ ...item, rank: i + 1 }));

        res.json({ leaderboard: ranked });
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
        const king = await User.findOne({ isReferralKing: true }).select("-_id name referralKingSince");
        res.json({ king: king || null });
    } catch (error) {
        console.error("King fetch error:", error);
        res.status(500).json({ error: "Failed to fetch king" });
    }
});

export default router;
