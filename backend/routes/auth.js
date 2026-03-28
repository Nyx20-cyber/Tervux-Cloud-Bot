import { Router } from "express";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getCachedPublicSettings } from "../models/SystemSettings.js";
import {
    generateToken,
    generateRefreshToken,
    hashRefreshToken,
    parseCookies,
    setRefreshTokenCookie,
    clearRefreshTokenCookie,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TTL_MS,
    authenticate
} from "../middleware/auth.js";
import { emitToUser } from "../services/socketService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { syncVipFlagOnUser } from "../services/gamificationService.js";

const sanitize = (str) => sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} }).trim();
const MAX_REFRESH_TOKENS_PER_USER = 5;
const AUTH_TRACE = process.env.AUTH_TRACE === "true" || process.env.NODE_ENV !== "production";

const traceAuth = (message, details = {}) => {
    if (!AUTH_TRACE) return;
    console.info(`[AuthTrace][Routes] ${message}`, details);
};

const buildRefreshTokenRecord = (rawToken, userAgent = "") => ({
    tokenHash: hashRefreshToken(rawToken),
    userAgent,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
});

const pruneRefreshTokens = (tokens = []) => {
    const now = Date.now();
    return tokens
        .filter((entry) => entry?.tokenHash && new Date(entry.expiresAt).getTime() > now)
        .sort((a, b) => new Date(b.lastUsedAt || b.createdAt).getTime() - new Date(a.lastUsedAt || a.createdAt).getTime())
        .slice(0, MAX_REFRESH_TOKENS_PER_USER);
};

const attachRefreshSession = async (user, req, res) => {
    const refreshToken = generateRefreshToken();
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
    const tokenRecord = buildRefreshTokenRecord(refreshToken, userAgent);
    user.refreshTokens = pruneRefreshTokens([...(user.refreshTokens || []), tokenRecord]);
    await user.save();
    setRefreshTokenCookie(res, refreshToken);
    traceAuth("Attached refresh session.", {
        userId: String(user._id),
        refreshSessionCount: user.refreshTokens.length,
        expiresAt: tokenRecord.expiresAt
    });
    return tokenRecord.expiresAt;
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
        const refreshTokenExpiresAt = await attachRefreshSession(user, req, res);

        res.status(201).json({
            success: true,
            token,
            refreshTokenExpiresAt,
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
        traceAuth("Login requested.", {
            email: String(email || "").toLowerCase(),
            hasPassword: Boolean(password),
            cookieHeaderPresent: Boolean(req.headers.cookie)
        });

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

        if (syncVipFlagOnUser(user)) {
            await user.save();
        }

        const token = generateToken(user._id);
        const refreshTokenExpiresAt = await attachRefreshSession(user, req, res);
        traceAuth("Login succeeded.", {
            userId: String(user._id),
            role: user.role,
            refreshTokenExpiresAt
        });

        res.json({
            success: true,
            token,
            refreshTokenExpiresAt,
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
        user.refreshTokens = [];
        await user.save();
        clearRefreshTokenCookie(res);

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
        traceAuth("Profile requested.", {
            userId: String(req.user._id),
            hasAuthHeader: Boolean(req.headers.authorization),
            cookieHeaderPresent: Boolean(req.headers.cookie)
        });
        const user = await User.findById(req.user._id);
        if (syncVipFlagOnUser(user)) {
            await user.save();
        }
        traceAuth("Profile returned.", {
            userId: String(user._id),
            role: user.role
        });
        res.json({ user: user.toJSON() });
    } catch (error) {
        console.error("Profile error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

router.put("/preferences/language", authenticate, async (req, res) => {
    try {
        const language = String(req.body?.language || "").toLowerCase();
        if (!["en", "sw"].includes(language)) {
            return res.status(400).json({ error: "Invalid language" });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.preferredLanguage = language;
        await user.save();

        const serializedUser = user.toJSON();
        emitToUser(user._id, "account_profile_updated", { user: serializedUser });

        res.json({ success: true, user: serializedUser });
    } catch (error) {
        console.error("Update language preference error:", error);
        res.status(500).json({ error: "Failed to update language preference" });
    }
});

router.post("/tutorial-onboarding/seen", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.tutorialOnboardingSeenAt) {
            user.tutorialOnboardingSeenAt = new Date();
            await user.save();
        }

        res.json({
            success: true,
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Tutorial onboarding seen error:", error);
        res.status(500).json({ error: "Failed to update tutorial onboarding state" });
    }
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token and issue a new access token
 */
router.post("/refresh", async (req, res) => {
    try {
        const cookies = parseCookies(req);
        const refreshToken = cookies[REFRESH_COOKIE_NAME];
        traceAuth("Refresh requested.", {
            hasRefreshCookie: Boolean(refreshToken),
            cookieNames: Object.keys(cookies || {})
        });
        if (!refreshToken) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: "Refresh token required" });
        }

        const refreshHash = hashRefreshToken(refreshToken);
        const user = await User.findOne({ "refreshTokens.tokenHash": refreshHash });
        if (!user) {
            traceAuth("Refresh failed: token not found.", {});
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: "Invalid refresh token" });
        }

        const matchingToken = (user.refreshTokens || []).find((entry) => entry.tokenHash === refreshHash);
        if (!matchingToken || new Date(matchingToken.expiresAt).getTime() <= Date.now()) {
            traceAuth("Refresh failed: token expired.", {
                userId: String(user._id)
            });
            user.refreshTokens = pruneRefreshTokens((user.refreshTokens || []).filter((entry) => entry.tokenHash !== refreshHash));
            await user.save();
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: "Refresh token expired" });
        }

        if (user.isBanned) {
            traceAuth("Refresh blocked for banned user.", {
                userId: String(user._id)
            });
            user.refreshTokens = pruneRefreshTokens((user.refreshTokens || []).filter((entry) => entry.tokenHash !== refreshHash));
            await user.save();
            clearRefreshTokenCookie(res);
            return res.status(403).json({ error: "Your account is suspended by administrator. Please contact support." });
        }

        if (syncVipFlagOnUser(user)) {
            await user.save();
        }

        const nextRefreshToken = generateRefreshToken();
        const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
        const nextTokenRecord = buildRefreshTokenRecord(nextRefreshToken, userAgent);
        user.refreshTokens = pruneRefreshTokens([
            ...(user.refreshTokens || []).filter((entry) => entry.tokenHash !== refreshHash),
            nextTokenRecord
        ]);
        await user.save();

        setRefreshTokenCookie(res, nextRefreshToken);
        traceAuth("Refresh succeeded.", {
            userId: String(user._id),
            refreshSessionCount: user.refreshTokens.length,
            nextExpiresAt: nextTokenRecord.expiresAt
        });

        return res.json({
            success: true,
            token: generateToken(user._id),
            refreshTokenExpiresAt: nextTokenRecord.expiresAt,
            user: user.toJSON()
        });
    } catch (error) {
        console.error("Refresh token error:", error);
        clearRefreshTokenCookie(res);
        return res.status(500).json({ error: "Failed to refresh session" });
    }
});

/**
 * POST /api/auth/logout
 * Revoke current refresh session and clear cookies
 */
router.post("/logout", async (req, res) => {
    try {
        const cookies = parseCookies(req);
        const refreshToken = cookies[REFRESH_COOKIE_NAME];
        traceAuth("Logout requested.", {
            hasRefreshCookie: Boolean(refreshToken)
        });
        if (refreshToken) {
            const refreshHash = hashRefreshToken(refreshToken);
            await User.updateOne(
                { "refreshTokens.tokenHash": refreshHash },
                { $pull: { refreshTokens: { tokenHash: refreshHash } } }
            );
        }
    } catch (error) {
        console.error("Logout cleanup error:", error);
    }

    clearRefreshTokenCookie(res);
    res.json({ success: true, message: "Logged out successfully" });
});

export default router;
