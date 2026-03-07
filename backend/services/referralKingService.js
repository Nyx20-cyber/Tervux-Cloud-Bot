import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getSettings } from "../models/SystemSettings.js";
import { emitToUser } from "./socketService.js";

/**
 * Weekly Referral King Ceremony
 * Runs every Sunday at 00:00 via cron.
 * 1. Finds the user with the highest weeklyReferralCount
 * 2. Dethrrones the old King
 * 3. Crowns the new King, awards 100 coins, and sends a notification
 * 4. Resets everyone's weeklyReferralCount to 0
 */
export async function runWeeklyKingCeremony() {
    console.log("👑 [ReferralKing] Starting weekly king ceremony...");

    try {
        // 0. Read dynamic settings
        const settings = await getSettings();
        const bonusCoins = settings.kingBonusCoins || 100;

        // 1. Find the top referrer this week (must have at least 1 referral)
        const topReferrer = await User.findOne({ weeklyReferralCount: { $gt: 0 } })
            .sort({ weeklyReferralCount: -1 })
            .limit(1);

        // 2. Dethrone previous king(s)
        await User.updateMany(
            { isReferralKing: true },
            { isReferralKing: false, referralKingSince: null }
        );

        if (!topReferrer) {
            console.log("👑 [ReferralKing] No eligible referrers this week. Broadcasting 'no winner' message.");
            const allUsers = await User.find({ isBanned: false }, { _id: 1 }).lean();
            if (allUsers.length > 0) {
                const noKingNotifications = allUsers.map(u => ({
                    userId: u._id,
                    title: "👑 No King Crowned This Week!",
                    message: `The throne is empty! 😱 Unfortunately, no one earned the Referral King title this week. This means the ${bonusCoins} bonus coins 🪙 are still up for grabs! Be the first to share your referral code this week and claim the crown next Sunday! — Tervux Team`,
                    type: "info"
                }));
                await Notification.insertMany(noKingNotifications);
            }
        } else {
            // 3. Crown the new king
            topReferrer.isReferralKing = true;
            topReferrer.referralKingSince = new Date();
            topReferrer.coins += bonusCoins;
            await topReferrer.save();
            emitToUser(topReferrer._id, "balance_update", { coins: topReferrer.coins });

            // 4. Send congratulatory notification to the winner
            await Notification.create({
                userId: topReferrer._id,
                title: "👑 You Are This Week's Referral King!",
                message: `Congratulations ${topReferrer.name}! 🎉 You were the top referrer this week with ${topReferrer.weeklyReferralCount} referral(s). As a reward, you've earned ${bonusCoins} bonus coins 🪙 and the royal 👑 King crown on your profile! Keep it up — defend your crown next Sunday! — Tervux Team`,
                type: "success"
            });

            // 5. Broadcast announcement to ALL other users
            const allOtherUsers = await User.find(
                { _id: { $ne: topReferrer._id }, isBanned: false },
                { _id: 1 }
            ).lean();

            if (allOtherUsers.length > 0) {
                const broadcastNotifications = allOtherUsers.map(u => ({
                    userId: u._id,
                    title: "👑 New Referral King Crowned!",
                    message: `This week's Referral King is ${topReferrer.name.charAt(0)}***${topReferrer.name.charAt(topReferrer.name.length - 1)} with ${topReferrer.weeklyReferralCount} referral(s)! 🏆 They earned ${bonusCoins} bonus coins 🪙 and the royal crown. Can you beat them next week? Share your referral code and compete! — Tervux Team`,
                    type: "info"
                }));
                await Notification.insertMany(broadcastNotifications);
                console.log(`👑 [ReferralKing] Broadcast sent to ${allOtherUsers.length} user(s).`);
            }

            console.log(`👑 [ReferralKing] Crowned: ${topReferrer.name} (${topReferrer._id}) — ${topReferrer.weeklyReferralCount} referrals — +${bonusCoins} coins`);
        }

        // 5. Reset all weekly counts for the new week
        await User.updateMany({}, { weeklyReferralCount: 0 });
        console.log("👑 [ReferralKing] Weekly referral counts reset. Ceremony complete.");

    } catch (error) {
        console.error("👑 [ReferralKing] Ceremony error:", error.message);
    }
}
