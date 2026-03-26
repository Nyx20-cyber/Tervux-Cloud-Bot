import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import Notification from "../models/Notification.js";
import {
    getWebPushPublicKey,
    isWebPushConfigured,
    removePushSubscription,
    savePushSubscription,
    sendPushToUser
} from "../services/pushNotificationService.js";

const router = Router();

/**
 * GET /api/notifications
 * Fetch user notifications
 */
router.get("/", authenticate, async (req, res) => {
    try {
        console.log("Fetching notifications for user:", req.user?._id);
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ notifications });
    } catch (error) {
        console.error("Fetch notifications error details:", error);
        res.status(500).json({
            error: "Failed to fetch notifications",
            details: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
    }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put("/:id/read", authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isRead: true },
            { returnDocument: "after" }
        );
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }
        res.json({ success: true, notification });
    } catch (error) {
        console.error("Mark notification read error:", error);
        res.status(500).json({ error: "Failed to update notification" });
    }
});

/**
 * PUT /api/notifications/read-all
 * Mark all user notifications as read
 */
router.put("/read-all", authenticate, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        console.error("Mark all notifications read error:", error);
        res.status(500).json({ error: "Failed to update notifications" });
    }
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification
 */
router.delete("/:id", authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Delete notification error:", error);
        res.status(500).json({ error: "Failed to delete notification" });
    }
});

router.get("/push/public-key", async (req, res) => {
    if (!isWebPushConfigured()) {
        return res.status(503).json({ error: "Web push is not configured" });
    }
    console.log("🔔 [Push] Public key requested.");
    res.json({ publicKey: getWebPushPublicKey() });
});

router.post("/push/subscribe", authenticate, async (req, res) => {
    try {
        if (!isWebPushConfigured()) {
            return res.status(503).json({ error: "Web push is not configured" });
        }
        const { subscription } = req.body;
        const saveResult = await savePushSubscription(req.user._id, subscription, req.headers["user-agent"] || "");
        let testResult = { sent: 0, failed: 0, skipped: true, reason: "unchanged_subscription" };

        if (saveResult.isNewSubscription) {
            testResult = await sendPushToUser(req.user._id, {
                title: "Tervux Notifications Enabled",
                body: "Push notifications are now active on this device.",
                url: `${process.env.FRONTEND_URL || "https://bot.tervux.com"}/dashboard/notifications`,
                tag: "push-enabled-test"
            });
        }

        console.log(`🔔 [Push] Subscribe route completed for user ${req.user._id}: subscriptions=${saveResult.total}, isNew=${saveResult.isNewSubscription}, changed=${saveResult.didChange}, testSent=${testResult.sent}, testFailed=${testResult.failed}, skipped=${Boolean(testResult.skipped)}`);
        res.json({
            success: true,
            subscriptions: saveResult.total,
            subscriptionChanged: saveResult.didChange,
            isNewSubscription: saveResult.isNewSubscription,
            testResult
        });
    } catch (error) {
        console.error("Save push subscription error:", error);
        res.status(400).json({ error: error.message || "Failed to save push subscription" });
    }
});

router.post("/push/unsubscribe", authenticate, async (req, res) => {
    try {
        const { endpoint } = req.body;
        await removePushSubscription(req.user._id, endpoint);
        res.json({ success: true });
    } catch (error) {
        console.error("Remove push subscription error:", error);
        res.status(500).json({ error: "Failed to remove push subscription" });
    }
});

router.post("/push/test", authenticate, async (req, res) => {
    try {
        const result = await sendPushToUser(req.user._id, {
            title: "Tervux Push Test",
            body: "Push notifications are now working on your device.",
            url: `${process.env.FRONTEND_URL || "https://bot.tervux.com"}/dashboard/deployments`,
            tag: "push-test"
        });
        console.log(`🔔 [Push] Manual test for user ${req.user._id}: sent=${result.sent}, failed=${result.failed}, skipped=${Boolean(result.skipped)}`);
        res.json({ success: true, result });
    } catch (error) {
        console.error("Test push error:", error);
        res.status(500).json({ error: "Failed to send test push" });
    }
});

export default router;
