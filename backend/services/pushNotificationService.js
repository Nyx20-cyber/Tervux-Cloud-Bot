import webpush from "web-push";
import User from "../models/User.js";

const VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:support@tervux.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://bot.tervux.com";

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (isConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function isWebPushConfigured() {
    return isConfigured;
}

export function getWebPushPublicKey() {
    return VAPID_PUBLIC_KEY;
}

export async function savePushSubscription(userId, subscription, userAgent = "") {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw new Error("Invalid push subscription");
    }

    const user = await User.findById(userId).select("pushSubscriptions");
    if (!user) throw new Error("User not found");

    const normalized = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        },
        userAgent: String(userAgent || "").slice(0, 500),
        updatedAt: new Date()
    };

    const existingIndex = (user.pushSubscriptions || []).findIndex((item) => item.endpoint === normalized.endpoint);
    if (existingIndex >= 0) {
        user.pushSubscriptions[existingIndex].keys = normalized.keys;
        user.pushSubscriptions[existingIndex].userAgent = normalized.userAgent;
        user.pushSubscriptions[existingIndex].updatedAt = normalized.updatedAt;
    } else {
        user.pushSubscriptions.push({
            ...normalized,
            createdAt: new Date()
        });
    }

    await user.save();
    return user.pushSubscriptions.length;
}

export async function removePushSubscription(userId, endpoint) {
    if (!endpoint) return 0;
    const result = await User.updateOne(
        { _id: userId },
        { $pull: { pushSubscriptions: { endpoint } } }
    );
    return result.modifiedCount || 0;
}

async function removeExpiredSubscription(endpoint) {
    await User.updateMany(
        { "pushSubscriptions.endpoint": endpoint },
        { $pull: { pushSubscriptions: { endpoint } } }
    );
}

export async function sendPushToUser(userId, payload) {
    if (!isConfigured) {
        return { sent: 0, failed: 0, skipped: true, reason: "web_push_not_configured" };
    }

    const user = await User.findById(userId).select("pushSubscriptions");
    if (!user?.pushSubscriptions?.length) {
        return { sent: 0, failed: 0, skipped: true, reason: "no_subscriptions" };
    }

    const body = JSON.stringify({
        title: payload.title || "Tervux Cloud Bot",
        body: payload.body || "",
        url: payload.url || `${FRONTEND_URL}/dashboard/deployments`,
        icon: payload.icon || "/icons/icon-192x192.png",
        badge: payload.badge || "/icons/icon-192x192.png",
        tag: payload.tag || "tervux-general",
        renotify: payload.renotify ?? false,
        requireInteraction: payload.requireInteraction ?? false,
        data: payload.data || {}
    });

    let sent = 0;
    let failed = 0;

    for (const subscription of user.pushSubscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.keys.p256dh,
                        auth: subscription.keys.auth
                    }
                },
                body
            );
            sent += 1;
        } catch (error) {
            failed += 1;
            if (error?.statusCode === 404 || error?.statusCode === 410) {
                await removeExpiredSubscription(subscription.endpoint);
            } else {
                console.error(`Push send failed for user ${userId}:`, error.message);
            }
        }
    }

    return { sent, failed, skipped: false };
}
