import { Router } from "express";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getCachedPublicSettings } from "../models/SystemSettings.js";
import { generateToken, authenticate } from "../middleware/auth.js";
import { emitToUser } from "../services/socketService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import validator from "validator";
import sanitizeHtml from "sanitize-html";

const sanitize = (str) => sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} }).trim();
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Dar_es_Salaam (UTC+3)

const getCurrentDailyClaimWindowStart = (now = new Date()) => {
    const eatNow = new Date(now.getTime() + EAT_OFFSET_MS);
    const y = eatNow.getUTCFullYear();
    const m = eatNow.getUTCMonth();
    const d = eatNow.getUTCDate();
    const h = eatNow.getUTCHours();

    let startAtEatMs = Date.UTC(y, m, d, 6, 0, 0, 0); // 12 asubuhi (06:00 EAT)
    if (h < 6) {
        startAtEatMs -= 24 * 60 * 60 * 1000;
    }
    return new Date(startAtEatMs - EAT_OFFSET_MS);
};

const router = Router();

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post("/register", authLimiter, async (req, res) => {
    try {
        const { email, password, name, referralCode } = req.body;

        const settings = await getCachedPublicSettings();
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
            return res.status(403).json({ error: "Your account is suspended by administrator. Please contact support." });
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
 * PUT /api/auth/account/profile
 * Update account name after confirming current name and password
 */
router.put("/account/profile", authenticate, async (req, res) => {
    try {
        const { currentName, newName, currentPassword } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ error: "User not found" });
        if (!currentName || !newName || !currentPassword) {
            return res.status(400).json({ error: "Current name, new name, and current password are required" });
        }

        if (sanitize(currentName) !== user.name) {
            return res.status(400).json({ error: "Current name does not match your account" });
        }

        const sanitizedNewName = sanitize(newName);
        if (!sanitizedNewName) {
            return res.status(400).json({ error: "Please provide a valid new name" });
        }

        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        user.name = sanitizedNewName;
        await user.save();

        const serializedUser = user.toJSON();
        emitToUser(user._id, "account_profile_updated", { user: serializedUser });

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Update profile name error:", error);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

/**
 * PUT /api/auth/account/email
 * Update account email after confirming current email and password
 */
router.put("/account/email", authenticate, async (req, res) => {
    try {
        const { currentEmail, newEmail, currentPassword } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ error: "User not found" });
        if (!currentEmail || !newEmail || !currentPassword) {
            return res.status(400).json({ error: "Current email, new email, and current password are required" });
        }

        const normalizedCurrentEmail = String(currentEmail).trim().toLowerCase();
        const normalizedNewEmail = String(newEmail).trim().toLowerCase();

        if (normalizedCurrentEmail !== user.email) {
            return res.status(400).json({ error: "Current email does not match your account" });
        }

        if (!validator.isEmail(normalizedNewEmail)) {
            return res.status(400).json({ error: "Please provide a valid new email address" });
        }

        const existingUser = await User.findOne({ email: normalizedNewEmail, _id: { $ne: user._id } }).lean();
        if (existingUser) {
            return res.status(409).json({ error: "That email is already in use" });
        }

        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        user.email = normalizedNewEmail;
        await user.save();

        const serializedUser = user.toJSON();
        emitToUser(user._id, "account_profile_updated", { user: serializedUser });

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Update account email error:", error);
        res.status(500).json({ error: "Failed to update email" });
    }
});

/**
 * PUT /api/auth/account/password
 * Update password after confirming current password
 */
router.put("/account/password", authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ error: "User not found" });
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current password and new password are required" });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ error: "New password must be at least 6 characters" });
        }

        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        const samePassword = await user.comparePassword(newPassword);
        if (samePassword) {
            return res.status(400).json({ error: "New password must be different from the current password" });
        }

        user.password = String(newPassword);
        await user.save();

        res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        console.error("Update account password error:", error);
        res.status(500).json({ error: "Failed to update password" });
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

        // Daily reset window is 12:00 asubuhi (06:00 EAT) every day.
        const now = new Date();
        const currentWindowStart = getCurrentDailyClaimWindowStart(now);
        const nextResetAt = new Date(currentWindowStart.getTime() + 24 * 60 * 60 * 1000);

        if (user.lastDailyClaim && new Date(user.lastDailyClaim) >= currentWindowStart) {
            return res.status(400).json({
                error: "Already claimed for this cycle. Come back after 12:00 asubuhi (06:00 EAT).",
                nextClaimAt: nextResetAt.toISOString()
            });
        }

        // Random 1-5 coins
        let rewardCoins = Math.floor(Math.random() * 5) + 1;

        user.dailyClaimCount += 1;
        user.coins += rewardCoins;
        user.lastDailyClaim = now;
        await user.save();
        emitToUser(user._id, "balance_update", {
            coins: user.coins,
            delta: rewardCoins,
            reason: "daily_claim"
        });

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
