import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import { sessionManager } from "../services/whatsappService.js";

const router = Router();

/**
 * GET /api/sessions
 * List user's WhatsApp sessions
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const sessions = await WhatsAppSession.find({ userId: req.user._id }).populate("subscription.planId");

        const enriched = sessions.map(session => {
            const isLive = sessionManager?.isConnected(session._id.toString());

            return {
                ...session.toJSON(),
                isLive: !!isLive,
                subscriptionInfo: session.subscription || null
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
router.post("/pair", authenticate, async (req, res) => {
    try {
        const { phoneNumber, method } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        // Start pairing through session manager
        const result = await sessionManager.startPairing(
            req.user._id.toString(),
            phoneNumber,
            method || "code",
            req.body.socketId
        );

        res.json(result);
    } catch (error) {
        console.error("Pair session error:", error);
        res.status(500).json({ error: error.message || "Failed to start pairing" });
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

        if (sessionManager?.isConnected(session._id.toString())) {
            await sessionManager.pauseSession(session._id.toString());
        }

        session.status = "paused";
        if (session.subscription) {
            session.subscription.status = "paused";
        }
        await session.save();

        res.json({ success: true, message: "Session paused successfully" });

        // Notify client via socket
        import("./socketService.js").then(({ emitToUser }) => {
            emitToUser(req.user._id.toString(), "session_update", {
                sessionId: session._id,
                status: "paused"
            });
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

        if (session.subscription?.status !== "paused" && session.subscription?.status !== "active") {
            return res.status(403).json({ error: "Session requires an active subscription to resume" });
        }

        // Subscription checks out, resume
        session.status = "active";
        session.subscription.status = "active";
        await session.save();

        await sessionManager.resumeSession(session._id.toString());

        res.json({ success: true, message: "Session resumed successfully" });

        // Notify client via socket
        import("./socketService.js").then(({ emitToUser }) => {
            emitToUser(req.user._id.toString(), "session_update", {
                sessionId: session._id,
                status: "active"
            });
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
