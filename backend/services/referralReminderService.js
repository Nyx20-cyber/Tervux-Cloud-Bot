import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendPushToUser } from "./pushNotificationService.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://bot.tervux.com";
const EAT_OFFSET_HOURS = 3;

function getCurrentReferralWindowStart(now = new Date()) {
    const eatNow = new Date(now.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000);
    return new Date(Date.UTC(
        eatNow.getUTCFullYear(),
        eatNow.getUTCMonth(),
        eatNow.getUTCDate(),
        14 - EAT_OFFSET_HOURS,
        0,
        0,
        0
    ));
}

function getReferralCopy(user) {
    const language = user.preferredLanguage === "sw" ? "sw" : "en";
    const hasCode = Boolean(String(user.referralCode || "").trim());

    if (language === "sw") {
        if (hasCode) {
            return {
                title: "Share referral code yako",
                body: "Share code yako upate coins za zawadi.",
                notificationTitle: "Referral Reminder",
                notificationMessage: "Share referral code yako upate coins za zawadi.",
            };
        }

        return {
            title: "Generate referral code",
            body: "Tengeneza code yako, share, kisha pata coins.",
            notificationTitle: "Referral Reminder",
            notificationMessage: "Tengeneza referral code yako na anza kupata coins.",
        };
    }

    if (hasCode) {
        return {
            title: "Share your referral code",
            body: "Share your code and earn bonus coins.",
            notificationTitle: "Referral Reminder",
            notificationMessage: "Share your referral code and earn bonus coins.",
        };
    }

    return {
        title: "Generate your referral code",
        body: "Create your code, share it, and earn coins.",
        notificationTitle: "Referral Reminder",
        notificationMessage: "Generate your referral code and start earning coins.",
    };
}

export async function runReferralReminderPush() {
    const now = new Date();
    const windowStart = getCurrentReferralWindowStart(now);
    const users = await User.find({
        pushSubscriptions: { $exists: true, $ne: [] },
        isBanned: false,
        $or: [
            { lastReferralReminderAt: null },
            { lastReferralReminderAt: { $lt: windowStart } }
        ]
    }).select("_id preferredLanguage referralCode lastReferralReminderAt");

    let sentUsers = 0;

    for (const user of users) {
        const copy = getReferralCopy(user);
        const result = await sendPushToUser(user._id, {
            title: copy.title,
            body: copy.body,
            url: `${FRONTEND_URL}/dashboard/referrals`,
            tag: "referral-reminder",
            renotify: true,
            data: { type: "referral-reminder" }
        });

        if (result.sent > 0) {
            sentUsers += 1;
            await User.updateOne(
                { _id: user._id },
                { $set: { lastReferralReminderAt: now } }
            );
            try {
                await Notification.create({
                    userId: user._id,
                    title: copy.notificationTitle,
                    message: copy.notificationMessage,
                    type: "info"
                });
            } catch (error) {
                console.error("Failed to create referral reminder notification:", error.message);
            }
        }
    }

    console.log(`🎁 [ReferralReminder] Sent to ${sentUsers}/${users.length} eligible user(s) for window ${windowStart.toISOString()}.`);
}
