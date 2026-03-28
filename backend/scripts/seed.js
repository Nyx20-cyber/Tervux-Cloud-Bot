import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../lib/db.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import { DEFAULT_COIN_PLANS, syncDefaultPlans } from "../utils/defaultPlans.js";

async function seed() {
    try {
        await connectDB();
        console.log("🌱 Seeding database...");

        // Disable old legacy plans
        await Plan.updateMany(
            { slug: { $in: ["siku", "wiki", "mwezi"] } },
            { $set: { isActive: false } }
        );

        // Upsert current default coin plans
        await syncDefaultPlans(Plan, { overwriteExisting: true });
        for (const plan of DEFAULT_COIN_PLANS) {
            console.log(`  ✅ Plan: ${plan.name} (${plan.price} TZS / ${plan.coinsAmount} Coins)`);
        }

        // Create admin user if ADMIN_EMAIL is set
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
            const existing = await User.findOne({ email: adminEmail });
            if (!existing) {
                await User.create({
                    email: adminEmail,
                    password: process.env.ADMIN_PASSWORD || "admin123",
                    name: "Admin",
                    role: "admin"
                });
                console.log(`  ✅ Admin user created: ${adminEmail}`);
            } else {
                console.log(`  ⏭️ Admin user already exists: ${adminEmail}`);
            }
        }

        console.log("✅ Seeding complete!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
}

seed();
