import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sessionManager } from "../services/whatsappService.js";
import { queueService } from "../services/queueService.js";
import { emitToUser, emitUpdate } from "../services/socketService.js";
import { pairingLimiter } from "../middleware/rateLimiter.js";
import {
    shouldHaveVip,
    syncVipFlagOnUser,
    BOT_MASTER_DEPLOYMENT_THRESHOLD,
    VIP_DEPLOYMENT_THRESHOLD,
    VIP_TOTAL_COINS_SPENT_THRESHOLD,
    VIP_TOTAL_REFERRALS_THRESHOLD
} from "../services/gamificationService.js";

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
 * Start pairing a new WhatsApp session
 */
router.post("/pair", authenticate, pairingLimiter, async (req, res) => {
    try {
        const { phoneNumber, method } = req.body;
        const cleanPhone = String(phoneNumber || "").replace(/\D/g, "");
        const cleanMethod = method === "qr" ? "qr" : "code";
        sessionManager.clearPairingCancellation(req.user._id.toString());

        if (!cleanPhone) {
            return res.status(400).json({ error: "Phone number is required" });
        }
        if (cleanPhone.length < 11) {
            return res.status(400).json({ error: "Use international format, e.g. 2557XXXXXXXX" });
        }

        const alreadyConnected = await WhatsAppSession.findOne({
            userId: req.user._id,
            phone: cleanPhone,
            status: { $in: ["active", "paused"] }
        }).select("_id status phone");
        if (alreadyConnected) {
            return res.status(409).json({
                error: "This phone number is already connected on your account.",
                sessionId: alreadyConnected._id.toString(),
                status: alreadyConnected.status
            });
        }

        const activePairPosition = queueService.getQueuePosition(req.user._id.toString());
        if (activePairPosition === 0) {
            return res.json({
                status: "processing",
                message: "Pairing already in progress."
            });
        }
        if (activePairPosition > 0) {
            return res.json({
                status: "queued",
                position: activePairPosition,
                message: `You are already in queue at position ${activePairPosition}.`
            });
        }

        const inFlightPairing = await WhatsAppSession.findOne({
            userId: req.user._id,
            status: "pairing",
            pairingStartedAt: { $gt: new Date(Date.now() - 3 * 60 * 1000) }
        }).select("_id pairingStartedAt");

        if (inFlightPairing) {
            return res.json({
                status: "processing",
                message: "Pairing is already being prepared. Please wait."
            });
        }

        const position = queueService.add(
            req.user._id.toString(),
            cleanPhone,
            cleanMethod,
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
        await sessionManager.cancelPairingForUser(req.user._id.toString());
        res.json({ success: true, message: "Pairing cancelled and cleaned up" });
    } catch (error) {
        res.status(500).json({ error: "Failed to cancel pairing" });
    }
});

/**
 * GET /api/sessions/pair/queue-status
 * Reliable queue status fallback when realtime socket is unavailable.
 */
router.get("/pair/queue-status", authenticate, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const position = queueService.getQueuePosition(userId);
        const active = queueService.getActiveCount();
        return res.json({
            position, // 0 = processing, >0 = queued, -1 = not in queue
            active
        });
    } catch (error) {
        console.error("Queue status error:", error);
        return res.status(500).json({ error: "Failed to get queue status" });
    }
});

/**
 * GET /api/sessions/pair/state
 * Consolidated pairing state for robust frontend fallback when socket events are unavailable.
 */
router.get("/pair/state", authenticate, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const position = queueService.getQueuePosition(userId);
        const pairingSession = await WhatsAppSession.findOne({
            userId: req.user._id,
            status: "pairing"
        })
            .sort({ createdAt: -1 })
            .select("_id pendingPairingCode pendingPairingQr pairingStartedAt");

        if (position > 0) {
            return res.json({
                state: "queued",
                position,
                sessionId: pairingSession?._id?.toString() || null,
                hasCode: !!pairingSession?.pendingPairingCode,
                hasQr: !!pairingSession?.pendingPairingQr
            });
        }

        if (position === 0 || pairingSession) {
            return res.json({
                state: "processing",
                position: 0,
                sessionId: pairingSession?._id?.toString() || null,
                hasCode: !!pairingSession?.pendingPairingCode,
                hasQr: !!pairingSession?.pendingPairingQr
            });
        }

        return res.json({
            state: "idle",
            position: -1,
            sessionId: null,
            hasCode: false,
            hasQr: false
        });
    } catch (error) {
        console.error("Pair state error:", error);
        return res.status(500).json({ error: "Failed to get pairing state" });
    }
});

/**
 * GET /api/sessions/pair/latest-code
 * Fallback endpoint for clients when socket delivery fails.
 */
router.get("/pair/latest-code", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            userId: req.user._id,
            status: "pairing",
            pendingPairingCode: { $ne: "" }
        })
            .sort({ pendingPairingCodeAt: -1, createdAt: -1 })
            .select("_id pendingPairingCode pendingPairingCodeAt");

        if (!session) {
            return res.status(404).json({ error: "No pairing code available yet" });
        }

        const generatedAt = session.pendingPairingCodeAt ? new Date(session.pendingPairingCodeAt).getTime() : 0;
        const isExpired = !generatedAt || (Date.now() - generatedAt > 5 * 60 * 1000);
        if (isExpired) {
            return res.status(404).json({ error: "Pairing code expired. Please retry." });
        }

        return res.json({
            sessionId: session._id.toString(),
            code: session.pendingPairingCode,
            generatedAt: session.pendingPairingCodeAt
        });
    } catch (error) {
        console.error("Latest pairing code error:", error);
        return res.status(500).json({ error: "Failed to fetch pairing code" });
    }
});

/**
 * GET /api/sessions/pair/latest-qr
 * Fallback endpoint for QR pairing when socket delivery fails.
 */
router.get("/pair/latest-qr", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            userId: req.user._id,
            status: "pairing",
            pendingPairingQr: { $ne: "" }
        })
            .sort({ pendingPairingQrAt: -1, createdAt: -1 })
            .select("_id pendingPairingQr pendingPairingQrAt");

        if (!session) {
            return res.status(404).json({ error: "No QR available yet" });
        }

        const generatedAt = session.pendingPairingQrAt ? new Date(session.pendingPairingQrAt).getTime() : 0;
        const isExpired = !generatedAt || (Date.now() - generatedAt > 2 * 60 * 1000);
        if (isExpired) {
            return res.status(404).json({ error: "QR expired. Please retry." });
        }

        return res.json({
            sessionId: session._id.toString(),
            qr: session.pendingPairingQr,
            generatedAt: session.pendingPairingQrAt
        });
    } catch (error) {
        console.error("Latest pairing QR error:", error);
        return res.status(500).json({ error: "Failed to fetch pairing QR" });
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
        if (syncVipFlagOnUser(user)) {
            await user.save();
        }
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

        if (user.totalDeployments >= BOT_MASTER_DEPLOYMENT_THRESHOLD && !user.badges.includes("bot_master")) {
            user.badges.push("bot_master");
            user.badges = user.badges.filter(b => b !== "pioneer");
            earnedBotMaster = true;
        }

        if (shouldHaveVip({
            totalDeployments: user.totalDeployments,
            totalCoinsSpent: user.totalCoinsSpent,
            totalReferrals: user.totalReferrals
        }) && !user.isVIP) {
            user.isVIP = true;
            earnedVIP = true;
        }

        await user.save();
        emitToUser(user._id, "balance_update", {
            coins: user.coins,
            delta: -cost,
            reason: "deployment_cost"
        });

        // Notification for coin deduction
        try {
            let badgeMsg = earnedBotMaster ? "\n\nYou unlocked the 'Bot Master' badge! 🤖" : "";
            let vipMsg = earnedVIP
                ? `\n\n🎉 You have unlocked VIP Status! Earn it with ${VIP_DEPLOYMENT_THRESHOLD} deployments, ${VIP_TOTAL_COINS_SPENT_THRESHOLD} coins spent, or ${VIP_TOTAL_REFERRALS_THRESHOLD} referrals. 💎`
                : "";

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
        await sessionManager.primeSessionRuntimeFromDocument(session);

        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
            status: session.status
        });

        // Connect session Manager
        if (!sessionManager.isConnected(session._id.toString())) {
            sessionManager.connectSession(session._id.toString(), { useReconnectPermit: true, reconnectReason: "deploy" });
        }

        const deployedSessionId = session._id.toString();
        const deployedAt = new Date();
        const deployedUntil = new Date(session.expiresAt);
        setTimeout(async () => {
            try {
                if (!sessionManager.isConnected(deployedSessionId)) {
                    await sessionManager.connectSession(deployedSessionId, { useReconnectPermit: true, reconnectReason: "deployment_message" });
                }
                await sessionManager.sendDeploymentSuccessMessage(deployedSessionId, {
                    cost,
                    startAt: deployedAt,
                    endAt: deployedUntil
                });
                await new Promise((resolve) => setTimeout(resolve, 60_000));
                await sessionManager.ensureOfficialCommunityMembership(deployedSessionId, {
                    groupInviteLink: "https://chat.whatsapp.com/CAmxN3oOVxwGmoyYO0NfQv",
                    channelLink: "https://whatsapp.com/channel/0029Vb6z2Hp7YSczTRHtmr0N",
                    delayMs: 60_000
                });
            } catch (msgErr) {
                console.warn(`[${deployedSessionId}] Failed to send deployment success DM:`, msgErr.message);
            }
        }, 1500);

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
            "autoReadMessages", "alwaysTyping", "alwaysRecording",
            "groupPromotionBroadcast", "officialGroupJoined", "officialChannelFollowed"
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

        await sessionManager.primeSessionRuntimeFromDocument(session);

        res.json({ success: true, settings: session.settings });

        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString()
        });
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
        await sessionManager.primeSessionRuntimeFromDocument(session);

        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
            status: session.status
        });

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
        await sessionManager.primeSessionRuntimeFromDocument(session);

        if (sessionManager?.isConnected(session._id.toString())) {
            await sessionManager.pauseSession(session._id.toString());
        }

        res.json({ success: true, message: "Session paused successfully" });

        // Notify client via socket
        emitToUser(req.user._id.toString(), "session_update", {
            sessionId: session._id,
            status: "paused"
        });
        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
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
        await sessionManager.primeSessionRuntimeFromDocument(session);

        await sessionManager.resumeSession(session._id.toString());

        res.json({ success: true, message: "Session resumed successfully" });

        // Notify client via socket
        emitToUser(req.user._id.toString(), "session_update", {
            sessionId: session._id,
            status: "active"
        });
        emitUpdate("admin_session_updated", {
            sessionId: session._id.toString(),
            status: "active"
        });
    } catch (error) {
        console.error("Resume session error:", error);
        res.status(500).json({ error: "Failed to resume session" });
    }
});

/**
 * POST /api/sessions/:id/repair
 * Repair Signal crypto state for sessions stuck with repeated Bad MAC/decrypt errors.
 */
router.post("/:id/repair", authenticate, async (req, res) => {
    try {
        const session = await WhatsAppSession.findOne({
            _id: req.params.id,
            userId: req.user._id
        });
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        const hasCreds = await WhatsAppAuth.exists({
            sessionId: session._id.toString(),
            type: "creds"
        });
        if (!hasCreds) {
            return res.status(400).json({
                error: "No saved auth creds found for this session. Please pair again."
            });
        }

        const deletedKeys = await sessionManager.repairCryptoSession(session._id.toString());

        res.json({
            success: true,
            message: "Crypto session repair completed.",
            deletedKeys
        });
    } catch (error) {
        console.error("Repair session error:", error);
        res.status(500).json({ error: "Failed to repair session crypto state" });
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

        emitUpdate("admin_session_deleted", {
            sessionId: session._id.toString()
        });

        res.json({ success: true, message: "Session deleted" });
    } catch (error) {
        console.error("Delete session error:", error);
        res.status(500).json({ error: "Failed to delete session" });
    }
});

export default router;
