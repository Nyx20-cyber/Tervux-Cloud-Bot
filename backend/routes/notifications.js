import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import Notification from "../models/Notification.js";

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
            { new: true }
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

export default router;
