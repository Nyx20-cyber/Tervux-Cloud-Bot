import { Router } from "express";
import User from "../models/User.js";
import { generateToken, authenticate } from "../middleware/auth.js";
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
        const { email, password, name, phone } = req.body;

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

        const user = await User.create({
            email: email.toLowerCase(),
            password,
            name: sanitize(name),
            phone: phone ? phone.replace(/[^0-9+]/g, "") : ""
        });

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
 * POST /api/auth/logout
 * Invalidate session on client (stateless — clears token expectation)
 */
router.post("/logout", authenticate, (req, res) => {
    // With stateless JWT, logout is handled client-side by removing the token.
    // This endpoint exists so clients have a standard endpoint to call.
    res.json({ success: true, message: "Logged out successfully" });
});

export default router;
