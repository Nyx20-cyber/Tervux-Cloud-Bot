import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

async function runMigration() {
    try {
        await connectDB();
        console.log("🌱 Starting Database Cleanup Migration...");

        const db = mongoose.connection.db;

        // 1. WhatsAppSessions: Migrate expiresAt and drop subscription
        console.log("📦 Migrating WhatsAppSessions...");
        const sessionsCursor = db.collection("whatsappsessions").find({});
        let sessionCount = 0;
        let updateCount = 0;

        for await (const session of sessionsCursor) {
            sessionCount++;
            let updates = { $unset: { subscription: "" } };
            let sets = {};

            if (session.subscription && session.subscription.expiresAt) {
                sets.expiresAt = session.subscription.expiresAt;
            } else if (!session.expiresAt) {
                sets.expiresAt = null;
            }

            if (Object.keys(sets).length > 0) {
                updates.$set = sets;
            }

            await db.collection("whatsappsessions").updateOne(
                { _id: session._id },
                updates
            );
            updateCount++;
        }
        console.log(`✅ Checked ${sessionCount} sessions, updated ${updateCount}.`);

        // 2. Plans: Drop durationDays and maxSessions
        console.log("📦 Migrating Plans...");
        const plansResult = await db.collection("plans").updateMany(
            {},
            { $unset: { durationDays: "", maxSessions: "" } }
        );
        console.log(`✅ Updated ${plansResult.modifiedCount} plans.`);

        console.log("🚀 Migration complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed", err);
        process.exit(1);
    }
}

runMigration();
