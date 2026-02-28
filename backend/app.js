import express from "express";
import cors from "cors";

// Route imports
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import adminRoutes from "./routes/admin.js";
import { authenticate } from "./middleware/auth.js";
import Plan from "./models/Plan.js";
import { sessionManager } from "./services/whatsappService.js";

const app = express();

// Middleware
app.use(cors());
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

// ========================
// Auth Routes (public)
// ========================
app.use("/api/auth", authRoutes);

// ========================
// Protected Routes
// ========================
app.use("/api/sessions", sessionRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);

export default app;
