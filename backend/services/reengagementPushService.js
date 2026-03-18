import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Notification from "../models/Notification.js";
import { sendPushToUser } from "./pushNotificationService.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://bot.tervux.com";
const EAT_OFFSET_HOURS = 3;

function getCurrentReengagementSlotStart(now = new Date()) {
    const eatNow = new Date(now.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000);
    const slotHours = [1, 6, 11, 16, 21];
    const slotHour = [...slotHours].reverse().find((hour) => eatNow.getUTCHours() >= hour) ?? 21;

    return new Date(Date.UTC(
        eatNow.getUTCFullYear(),
        eatNow.getUTCMonth(),
        eatNow.getUTCDate(),
        slotHour - EAT_OFFSET_HOURS,
        0,
        0,
        0
    ));
}

function getLocalizedReminder(user, sessionCount) {
    const language = user.preferredLanguage === "sw" ? "sw" : "en";

    if (language === "sw") {
        return {
            title: "Rudi kwenye Tervux",
            body: sessionCount > 0
                ? "Ingia deploy bots zako na update configurations."
                : "Ingia, connect namba, deploy bot, kisha malizia setup.",
            notificationTitle: "Kumbusho la App",
            notificationMessage: sessionCount > 0
                ? "Deploy bots zako na update configurations."
                : "Connect namba yako, deploy bot, na malizia setup."
        };
    }

    return {
        title: "Come back to Tervux",
        body: sessionCount > 0
            ? "Open the app to deploy bots and update settings."
            : "Open the app, connect your number, deploy a bot, and finish setup.",
        notificationTitle: "App Reminder",
        notificationMessage: sessionCount > 0
            ? "Deploy bots and update configurations."
            : "Connect your number, deploy a bot, and finish setup."
    };
}

export async function runReengagementPush() {
    const now = new Date();
    const slotStart = getCurrentReengagementSlotStart(now);
    const users = await User.find({
        pushSubscriptions: { $exists: true, $ne: [] },
        isBanned: false,
        $or: [
            { lastReengagementReminderAt: null },
            { lastReengagementReminderAt: { $lt: slotStart } }
        ]
    }).select("_id preferredLanguage lastReengagementReminderAt");

    let sentUsers = 0;
    let recordedUsers = 0;
    let failedUsers = 0;

    for (const user of users) {
        try {
            const sessionCount = await WhatsAppSession.countDocuments({ userId: user._id });
            const copy = getLocalizedReminder(user, sessionCount);

            await User.updateOne(
                { _id: user._id },
                { $set: { lastReengagementReminderAt: now } }
            );

            try {
                await Notification.create({
                    userId: user._id,
                    title: copy.notificationTitle,
                    message: copy.notificationMessage,
                    type: "info",
                    link: "/dashboard/deployments",
                    createdAt: now,
                    updatedAt: now
                });
                recordedUsers += 1;
            } catch (error) {
                console.error("Failed to create re-engagement notification:", error.message);
            }

            const result = await sendPushToUser(user._id, {
                title: copy.title,
                body: copy.body,
                url: `${FRONTEND_URL}/dashboard/deployments`,
                tag: "reengagement-reminder",
                renotify: true,
                data: { type: "reengagement-reminder" }
            });

            if (result.sent > 0) {
                sentUsers += 1;
            }
        } catch (error) {
            failedUsers += 1;
            console.error(`🔔 [ReengagementPush] Failed for user ${user._id}:`, error.message);
        }
    }

    console.log(`🔔 [ReengagementPush] Recorded ${recordedUsers}/${users.length} eligible user(s) for slot ${slotStart.toISOString()} and pushed ${sentUsers} (failed=${failedUsers}).`);
}
