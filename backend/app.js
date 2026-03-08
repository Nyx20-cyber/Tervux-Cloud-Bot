import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

// Route imports
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import referralRoutes from "./routes/referral.js";
import dashboardRoutes from "./routes/dashboard.js";
import webhookRoutes from "./routes/webhooks.js";
import { authenticate } from "./middleware/auth.js";
import Plan from "./models/Plan.js";
import Announcement from "./models/Announcement.js";
import { getSettings } from "./models/SystemSettings.js";
import { sessionManager } from "./services/whatsappService.js";
import User from "./models/User.js";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-do-not-use-in-prod";

// Maintenance Mode Middleware
app.use(async (req, res, next) => {
    try {
        const settings = await getSettings();
        if (settings.maintenanceMode) {
            const isAllowedDuringMaintenance =
                req.path.startsWith("/api/admin") ||
                req.path.startsWith("/api/auth/login") ||
                req.path.startsWith("/api/auth/me") ||
                req.path.startsWith("/api/config") ||
                req.path.startsWith("/webhook") ||
                req.path.startsWith("/api/webhooks");

            if (!isAllowedDuringMaintenance) {
                const authHeader = req.headers.authorization || "";
                const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

                if (token) {
                    try {
                        const decoded = jwt.verify(token, JWT_SECRET);
                        const adminUser = await User.findById(decoded.userId).select("role").lean();
                        if (adminUser?.role === "admin") {
                            return next();
                        }
                    } catch {
                        // Ignore and continue to maintenance response
                    }
                }

                return res.status(503).json({
                    error: "Platform is currently under maintenance. Please try again later.",
                    maintenance: true
                });
            }
        }
        next();
    } catch (error) {
        next(); // Don't block if settings fetch fails
    }
});

// Middleware
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
    : ["http://localhost:3000", "http://localhost:5173"];

app.use(cors({
    origin: process.env.NODE_ENV === "production" ? allowedOrigins : "*",
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ========================
// Public Routes
// ========================

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "OK",
        service: "Tervux WhatsApp Bot - SaaS Platform",
        version: "3.0.0"
    });
});

// GET /api/announcements
// Fetch active announcements for users
app.get("/api/announcements", authenticate, async (req, res) => {
    try {
        const announcements = await Announcement.find({ isActive: true })
            .populate("createdBy", "name")
            .sort({ createdAt: -1 });
        res.json({ announcements });
    } catch (error) {
        console.error("Fetch announcements error:", error);
        res.status(500).json({ error: "Failed to fetch announcements" });
    }
});

// Public: list plans
app.get("/api/plans", async (req, res) => {
    try {
        const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
        res.json({ plans });
    } catch (error) {
        res.status(500).json({ error: "Failed to list plans" });
    }
});

// Public: platform stats (limited)
app.get("/api/stats", async (req, res) => {
    res.json({
        activeSessions: sessionManager?.getActiveCount() || 0,
        service: "Tervux WhatsApp Bot"
    });
});

// GET /api/config
// Public platform configuration
app.get("/api/config", async (req, res) => {
    try {
        const settings = await getSettings();
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
        res.json({
            siteName: settings.siteName,
            supportPhone: settings.supportPhone,
            maintenanceMode: !!settings.maintenanceMode,
            registrationEnabled: !!settings.registrationEnabled,
            updatedAt: settings.updatedAt
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch config" });
    }
});

// ========================
// Auth Routes (public)
// ========================
app.use("/api/auth", authRoutes);
app.use("/webhook", webhookRoutes);
app.use("/api/webhooks", webhookRoutes);

// ========================
// Protected Routes
// ========================
app.use("/api/sessions", sessionRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);

export default app;
