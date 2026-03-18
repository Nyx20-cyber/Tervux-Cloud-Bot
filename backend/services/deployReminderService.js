import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Notification from "../models/Notification.js";
import { sendPushToUser } from "./pushNotificationService.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://bot.tervux.com";
const DEPLOY_REMINDER_COOLDOWN_MS = Number.parseInt(process.env.DEPLOY_REMINDER_COOLDOWN_MS || String(24 * 60 * 60 * 1000), 10);

export async function runDeployReminderPush() {
    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - DEPLOY_REMINDER_COOLDOWN_MS);

    const candidateUsers = await User.find({
        pushSubscriptions: { $exists: true, $ne: [] },
        $or: [
            { lastDeployReminderAt: null },
            { lastDeployReminderAt: { $lt: cooldownCutoff } }
        ]
    }).select("_id name preferredLanguage lastDeployReminderAt");

    let attempted = 0;
    let sentUsers = 0;
    let recordedUsers = 0;
    let failedUsers = 0;

    for (const user of candidateUsers) {
        try {
            const sessions = await WhatsAppSession.find({ userId: user._id })
                .select("status expiresAt")
                .lean();

            if (!sessions.length) continue;

            const hasActiveDeployment = sessions.some((session) =>
                session.status === "active" &&
                session.expiresAt &&
                new Date(session.expiresAt) > now
            );
            if (hasActiveDeployment) continue;

            const hasDeployableSession = sessions.some((session) =>
                ["active", "paused", "disconnected", "pairing"].includes(session.status)
            );
            if (!hasDeployableSession) continue;

            attempted += 1;
            const language = user.preferredLanguage === "sw" ? "sw" : "en";
            const copy = language === "sw"
                ? {
                    title: "Deploy bot yako",
                    body: "Ingia deploy session yako sasa.",
                    notificationTitle: "Deploy Reminder",
                    notificationMessage: "Ingia deploy bot yako sasa.",
                    link: "/dashboard/deployments"
                }
                : {
                    title: "Deploy your bot",
                    body: "Open the app and deploy your session now.",
                    notificationTitle: "Deploy Reminder",
                    notificationMessage: "Open the app and deploy your bot now.",
                    link: "/dashboard/deployments"
                };

            await User.updateOne(
                { _id: user._id },
                { $set: { lastDeployReminderAt: now } }
            );

            try {
                await Notification.create({
                    userId: user._id,
                    title: copy.notificationTitle,
                    message: copy.notificationMessage,
                    type: "info",
                    link: copy.link,
                    createdAt: now,
                    updatedAt: now
                });
                recordedUsers += 1;
            } catch (error) {
                console.error("Failed to create deploy reminder notification:", error.message);
            }

            const result = await sendPushToUser(user._id, {
                title: copy.title,
                body: copy.body,
                url: `${FRONTEND_URL}/dashboard/deployments`,
                tag: "deploy-reminder",
                renotify: true,
                data: { type: "deploy-reminder" }
            });

            if (result.sent > 0) {
                sentUsers += 1;
            }
        } catch (error) {
            failedUsers += 1;
            console.error(`🔔 [DeployReminder] Failed for user ${user._id}:`, error.message);
        }
    }

    console.log(`🔔 [DeployReminder] Checked ${candidateUsers.length} user(s), targeted ${attempted}, recorded ${recordedUsers}, pushed ${sentUsers}, failed ${failedUsers}.`);
}
