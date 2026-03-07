import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

/**
 * Migration Script: Retroactive Gamification
 *
 * Requirements:
 * 1. All users must have exactly one base badge (Pioneer).
 * 2. If they qualify for Social Butterfly (10+ refs) or Bot Master (3+ deployments), they receive those instead of Pioneer.
 * 3. They can hold BOTH Social Butterfly and Bot Master.
 * 4. VIP Status (💎) is separate, awarded at 50+ referrals OR 1000+ coins spent.
 *
 * NOTE: Since we didn't track totalDeployments and totalCoinsSpent previously, 
 * we can't reliably retroactively award Bot Master or spend-based VIP for past sessions 
 * (unless we parse all historical sessions if they are kept). 
 * We will calculate what we can (Referrals) and default the rest.
 */

const executeMigration = async () => {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const users = await User.find({});
        console.log(`Found ${users.length} users. Processing...`);

        let countModified = 0;

        for (const user of users) {
            let modified = false;

            // Ensure schema default formats if missing
            if (!user.badges) { user.badges = []; modified = true; }
            if (user.isVIP === undefined) { user.isVIP = false; modified = true; }
            if (user.totalDeployments === undefined) { user.totalDeployments = 0; modified = true; }
            if (user.totalCoinsSpent === undefined) { user.totalCoinsSpent = 0; modified = true; }

            // Retroactively calculate total referrals by looking at the referredBy field in other users
            // (Assuming 'referredBy' points to this user's _id)
            const refCount = await User.countDocuments({ referredBy: user._id });
            if (user.totalReferrals !== refCount) {
                user.totalReferrals = refCount;
                modified = true;
            }

            // Determine Badges & VIP
            const earnedBadges = new Set(user.badges);

            // 1. Check VIP Constraints
            if (user.totalReferrals >= 50 || user.totalCoinsSpent >= 1000) {
                if (!user.isVIP) {
                    user.isVIP = true;
                    modified = true;
                    console.log(`Awarded VIP to ${user.email} (Refs: ${user.totalReferrals}, Spent: ${user.totalCoinsSpent})`);
                }
            }

            // 2. Check Advanced Badges
            if (user.totalReferrals >= 10 && !earnedBadges.has("social_butterfly")) {
                earnedBadges.add("social_butterfly");
                modified = true;
            }

            if (user.totalDeployments >= 3 && !earnedBadges.has("bot_master")) {
                earnedBadges.add("bot_master");
                modified = true;
            }

            // 3. Enforce Exclusivity logic:
            // "everyone starts with pioneer. If they get social_butterfly or bot_master, pioneer disappears."
            if (earnedBadges.has("social_butterfly") || earnedBadges.has("bot_master")) {
                if (earnedBadges.has("pioneer")) {
                    earnedBadges.delete("pioneer");
                    modified = true;
                }
            } else {
                // If they have no advanced badges, they MUST have Pioneer.
                if (!earnedBadges.has("pioneer")) {
                    earnedBadges.add("pioneer");
                    modified = true;
                }
            }

            // Save badges
            const finalBadges = Array.from(earnedBadges);

            // Check if arrays differ
            if (JSON.stringify(user.badges.sort()) !== JSON.stringify(finalBadges.sort())) {
                user.badges = finalBadges;
                modified = true;
            }

            if (modified) {
                await user.save();
                countModified++;
            }
        }

        console.log(`Migration completed successfully! Modified ${countModified} users.`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
};

executeMigration();
