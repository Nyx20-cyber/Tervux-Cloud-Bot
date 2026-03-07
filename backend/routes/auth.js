import { Router } from "express";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getSettings } from "../models/SystemSettings.js";
import { generateToken, authenticate } from "../middleware/auth.js";
import { emitToUser } from "../services/socketService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import validator from "validator";
import sanitizeHtml from "sanitize-html";

const sanitize = (str) => sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} }).trim();

const router = Router();

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post("/register", authLimiter, async (req, res) => {
    try {
        const { email, password, name, phone, referralCode } = req.body;

        const settings = await getSettings();
        if (!settings.registrationEnabled) {
            return res.status(403).json({ error: "Registration is currently disabled by the administrator" });
        }

        if (!email || !password || !name) {
            return res.status(400).json({ error: "Email, password, and name are required" });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: "Please provide a valid email address" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        // Check if user exists
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: "Email already registered" });
        }

        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({
                referralCode
            });
            if (!referrer) {
                return res.status(400).json({ error: "Invalid referral code" });
            }
        }

        const user = await User.create({
            email: email.toLowerCase(),
            password,
            name: sanitize(name),
            phone: phone ? phone.replace(/[^0-9+]/g, "") : "",
            referredBy: referrer ? referrer._id : null
        });

        // Notify both parties about the pending referral
        if (referrer) {
            try {
                // 1. Notify Referrer
                const notifyReferrer = await Notification.create({
                    userId: referrer._id,
                    title: "New Pending Referral! 👤",
                    message: `Someone joined with your code. You'll get 10 coins once they make their first successful purchase!`,
                    type: "info"
                });
                emitToUser(referrer._id, "new_notification", notifyReferrer);

                // 2. Notify New User
                const notifyUser = await Notification.create({
                    userId: user._id,
                    title: "Welcome! 🎁",
                    message: `By using a friend's code, you've helped them out! They'll get a reward once you make your first coin purchase.`,
                    type: "info"
                });
                emitToUser(user._id, "new_notification", notifyUser);
            } catch (err) {
                console.error("Failed to create referral notifications:", err);
            }
        }

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

/**
 * POST /api/auth/login
 * Login and receive JWT token
 */
router.post("/login", authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: "Account suspended" });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get("/me", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ user: user.toJSON() });
    } catch (error) {
        console.error("Profile error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

/**
 * POST /api/auth/daily-claim
 * Claim daily reward (Punch Card)
 */
router.post("/daily-claim", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Check if already claimed today based on server local time for simplicity
        const now = new Date();
        if (user.lastDailyClaim) {
            const lastDate = new Date(user.lastDailyClaim).setHours(0, 0, 0, 0);
            const todayDate = new Date(now).setHours(0, 0, 0, 0);

            if (lastDate === todayDate) {
                return res.status(400).json({ error: "Already claimed today! Come back tomorrow." });
            }
        }

        // Random 1-5 coins
        let rewardCoins = Math.floor(Math.random() * 5) + 1;

        user.dailyClaimCount += 1;
        user.coins += rewardCoins;
        user.lastDailyClaim = now;
        await user.save();

        let title = "Daily Reward Claimed! 🎁";
        let message = `You received your daily reward of ${rewardCoins} coins 🪙! Come back tomorrow!`;

        try {
            const notification = await Notification.create({
                userId: user._id,
                title,
                message,
                type: "success"
            });
            emitToUser(user._id, "new_notification", notification);
        } catch (err) {
            console.error("Failed to create daily claim notification:", err);
        }

        res.json({
            success: true,
            rewardCoins,
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Daily claim error:", error);
        res.status(500).json({ error: "Failed to claim daily reward" });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate session on client (stateless — clears token expectation)
 */
router.post("/logout", authenticate, (req, res) => {
    // With stateless JWT, logout is handled client-side by removing the token.
    // This endpoint exists so clients have a standard endpoint to call.
    res.json({ success: true, message: "Logged out successfully" });
});

export default router;
