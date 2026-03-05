import express from "express";
import cors from "cors";

// Route imports
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import { authenticate } from "./middleware/auth.js";
import Plan from "./models/Plan.js";
import Announcement from "./models/Announcement.js";
import { getSettings } from "./models/SystemSettings.js";
import { sessionManager } from "./services/whatsappService.js";

const app = express();

// Maintenance Mode Middleware
app.use(async (req, res, next) => {
    try {
        const settings = await getSettings();
        if (settings.maintenanceMode) {
            // For now, let's skip check for /api/admin paths 
            // but in a more robust system, we would check for req.user.role === 'admin'
            // Since we don't have user in req here (authenticate is later), we use a path check
            if (!req.path.startsWith("/api/admin") && !req.path.startsWith("/api/auth/login")) {
                // We'll allow admins to bypass if they are already authenticated, 
                // but for simplicity, we'll just check if it's NOT an admin route
                // If it's a regular user route, return 503
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
        res.json({
            siteName: settings.siteName,
            supportPhone: settings.supportPhone
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch config" });
    }
});

// ========================
// Auth Routes (public)
// ========================
app.use("/api/auth", authRoutes);

// ========================
// Protected Routes
// ========================
app.use("/api/sessions", sessionRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

export default app;
