import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sessionManager } from "../services/whatsappService.js";
import { queueService } from "../services/queueService.js";
import { emitToUser } from "../services/socketService.js";
import { pairingLimiter } from "../middleware/rateLimiter.js";

const router = Router();

/**
 * GET /api/sessions
 * List user's WhatsApp sessions
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const sessions = await WhatsAppSession.find({ userId: req.user._id });

        const enriched = sessions.map(session => {
            const isLive = sessionManager?.isConnected(session._id.toString());

            return {
                ...session.toJSON(),
                isLive: !!isLive
            };
        });

        res.json({ sessions: enriched });
    } catch (error) {
        console.error("List sessions error:", error);
        res.status(500).json({ error: "Failed to list sessions" });
    }
});

/**
 * POST /api/sessions/pair
 * Start pairing a new WhatsApp session (unlimited, but only active with subscription)
 */
router.post("/pair", authenticate, pairingLimiter, async (req, res) => {
    try {
        const { phoneNumber, method } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const position = queueService.add(
            req.user._id.toString(),
            phoneNumber,
            method || "code",
            req.body.socketId
        );

        if (position > 0) {
            return res.json({
                status: "queued",
                position,
                message: `Server is busy. You are number ${position} in queue.`
            });
        }

        res.json({ status: "processing", message: "Pairing process started." });
    } catch (error) {
        console.error("Pair session error:", error);
        res.status(500).json({ error: error.message || "Failed to start pairing" });
    }
});

/**
 * DELETE /api/sessions/pair/queue
 * Leave the pairing queue
 */
router.delete("/pair/queue", authenticate, async (req, res) => {
    try {
        queueService.remove(req.user._id.toString());
        res.json({ success: true, message: "Removed from queue" });
    } catch (error) {
        res.status(500).json({ error: "Failed to leave queue" });
    }
});

/**
 * POST /api/sessions/:id/deploy
 * Deploy a bot by spending 50 coins
 */
router.post("/:id/deploy", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
            return res.status(400).json({ error: "Session is already deployed and active" });
        }

        const user = await User.findById(req.user._id);
        const cost = user.isVIP ? 45 : 50;

        if (!user || user.coins < cost) {
            return res.status(402).json({ error: `Insufficient coins. You need ${cost} coins to deploy.` });
        }

        // Deduct coins and track gamification
        user.coins -= cost;
        user.totalDeployments = (user.totalDeployments || 0) + 1;
        user.totalCoinsSpent = (user.totalCoinsSpent || 0) + cost;

        let earnedBotMaster = false;
        let earnedVIP = false;

        if (user.totalDeployments >= 3 && !user.badges.includes("bot_master")) {
            user.badges.push("bot_master");
            user.badges = user.badges.filter(b => b !== "pioneer");
            earnedBotMaster = true;
        }

        if (user.totalCoinsSpent >= 1000 && !user.isVIP) {
            user.isVIP = true;
            earnedVIP = true;
        }

        await user.save();

        // Notification for coin deduction
        try {
            let badgeMsg = earnedBotMaster ? "\n\nYou unlocked the 'Bot Master' badge! 🤖" : "";
            let vipMsg = earnedVIP ? "\n\n🎉 You have unlocked VIP Status! 💎" : "";

            await Notification.create({
                userId: user._id,
                title: "Coins Spent 🪙",
                message: `Spent ${cost} coins to deploy bot for ${session.phone || "your device"}. Your new balance is ${user.coins} coins.${badgeMsg}${vipMsg}`,
                type: "info"
            });
        } catch (err) {
            console.error("Failed to create deployment notification:", err);
        }

        // Set session to active with absolute expiration date
        session.status = "active";
        session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await session.save();

        // Connect session Manager
        if (!sessionManager.isConnected(session._id.toString())) {
            sessionManager.connectSession(session._id.toString());
        }

        res.json({ success: true, message: "Bot deployed successfully!", coins: user.coins });
    } catch (error) {
        console.error("Deploy bot error:", error);
        res.status(500).json({ error: "Failed to deploy bot" });
    }
});

/**
 * GET /api/sessions/:id/status
 * Get a session's status
 */
router.get("/:id/status", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        const isLive = sessionManager?.isConnected(session._id.toString());

        res.json({
            status: session.status,
            isLive: !!isLive,
            phone: session.phone,
            lastConnected: session.lastConnected,
            settings: session.settings
        });
    } catch (error) {
        console.error("Session status error:", error);
        res.status(500).json({ error: "Failed to get session status" });
    }
});

/**
 * PUT /api/sessions/:id/settings
 * Update session settings
 */
router.put("/:id/settings", authenticate, async (req, res) => {
    try {
        const allowedSettings = [
            "prefix", "alwaysOnline", "autoLikeStatus", "autoViewStatus",
            "antiDelete", "antiCall", "antiViewOnce", "antiRemove",
            "autoReadMessages", "alwaysTyping", "alwaysRecording"
        ];

        const updates = {};
        for (const key of allowedSettings) {
            if (req.body[key] !== undefined) {
                updates[`settings.${key}`] = req.body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: "No valid settings provided" });
        }

        const session = await WhatsAppSession.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: updates },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Notify the live session about settings change
        if (sessionManager?.isConnected(session._id.toString())) {
            sessionManager.invalidateConfigCache(session._id.toString());
        }

        res.json({ success: true, settings: session.settings });
    } catch (error) {
        console.error("Update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

/**
 * POST /api/sessions/:id/disconnect
 * Disconnect a WhatsApp session
 */
router.post("/:id/disconnect", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        await sessionManager.disconnectSession(session._id.toString());

        session.status = "disconnected";
        await session.save();

        res.json({ success: true, message: "Session disconnected" });
    } catch (error) {
        console.error("Disconnect session error:", error);
        res.status(500).json({ error: "Failed to disconnect session" });
    }
});

/**
 * POST /api/sessions/:id/pause
 * Pause a WhatsApp session temporarily
 */
router.post("/:id/pause", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        session.status = "paused";
        await session.save();

        if (sessionManager?.isConnected(session._id.toString())) {
            await sessionManager.pauseSession(session._id.toString());
        }

        res.json({ success: true, message: "Session paused successfully" });

        // Notify client via socket
        emitToUser(req.user._id.toString(), "session_update", {
            sessionId: session._id,
            status: "paused"
        });
    } catch (error) {
        console.error("Pause session error:", error);
        res.status(500).json({ error: "Failed to pause session" });
    }
});

/**
 * POST /api/sessions/:id/resume
 * Resume a paused WhatsApp session
 */
router.post("/:id/resume", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        if (!session.expiresAt || new Date(session.expiresAt) < new Date()) {
            return res.status(403).json({ error: "Session is expired or has not been deployed. Please deploy with coins first." });
        }

        // Subscription checks out, resume
        session.status = "active";
        await session.save();

        await sessionManager.resumeSession(session._id.toString());

        res.json({ success: true, message: "Session resumed successfully" });

        // Notify client via socket
        emitToUser(req.user._id.toString(), "session_update", {
            sessionId: session._id,
            status: "active"
        });
    } catch (error) {
        console.error("Resume session error:", error);
        res.status(500).json({ error: "Failed to resume session" });
    }
});

/**
 * DELETE /api/sessions/:id
 * Delete a session permanently
 */
router.delete("/:id", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Disconnect if active
        await sessionManager.destroySession(session._id.toString());

        // Remove from DB
        await WhatsAppSession.deleteOne({ _id: session._id });

        res.json({ success: true, message: "Session deleted" });
    } catch (error) {
        console.error("Delete session error:", error);
        res.status(500).json({ error: "Failed to delete session" });
    }
});

export default router;
