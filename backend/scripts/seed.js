import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../lib/db.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";

const plans = [
    {
        name: "50 Coins",
        slug: "50-coins",
        price: 1500,
        currency: "TZS",
        coinsAmount: 50,
        description: "50 Coins — Deploy 1 Bot"
    },
    {
        name: "100 Coins",
        slug: "100-coins",
        price: 2000,
        currency: "TZS",
        coinsAmount: 100,
        description: "100 Coins — Deploy 2 Bots"
    },
    {
        name: "250 Coins",
        slug: "250-coins",
        price: 3000,
        currency: "TZS",
        coinsAmount: 250,
        description: "250 Coins — Deploy 5 Bots"
    }
];

async function seed() {
    try {
        await connectDB();
        console.log("🌱 Seeding database...");

        // Disable old legacy plans
        await Plan.updateMany(
            { slug: { $in: ["siku", "wiki", "mwezi"] } },
            { $set: { isActive: false } }
        );

        // Upsert new coin plans
        for (const plan of plans) {
            await Plan.findOneAndUpdate(
                { slug: plan.slug },
                plan,
                { upsert: true, returnDocument: "after" }
            );
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
