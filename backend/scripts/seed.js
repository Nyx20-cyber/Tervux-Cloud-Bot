import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../lib/db.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";

const plans = [
    {
        name: "Siku",
        slug: "siku",
        price: 200,
        currency: "TZS",
        durationDays: 1,
        maxSessions: 1,
        description: "Siku 1 — Bot yako ya WhatsApp kwa siku moja"
    },
    {
        name: "Wiki",
        slug: "wiki",
        price: 700,
        currency: "TZS",
        durationDays: 7,
        maxSessions: 1,
        description: "Wiki 1 — Bot yako ya WhatsApp kwa wiki moja"
    },
    {
        name: "Mwezi",
        slug: "mwezi",
        price: 1200,
        currency: "TZS",
        durationDays: 30,
        maxSessions: 1,
        description: "Mwezi 1 — Bot yako ya WhatsApp kwa mwezi mzima"
    }
];

async function seed() {
    try {
        await connectDB();
        console.log("🌱 Seeding database...");

        // Upsert plans
        for (const plan of plans) {
            await Plan.findOneAndUpdate(
                { slug: plan.slug },
                plan,
                { upsert: true, new: true }
            );
            console.log(`  ✅ Plan: ${plan.name} (${plan.price} TZS / ${plan.durationDays} days)`);
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
