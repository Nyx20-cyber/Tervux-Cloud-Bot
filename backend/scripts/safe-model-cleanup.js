import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";

import Announcement from "../models/Announcement.js";
import FastLipaWebhookLog from "../models/FastLipaWebhookLog.js";
import GroupSettings from "../models/GroupSettings.js";
import Notification from "../models/Notification.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import SystemSettings from "../models/SystemSettings.js";
import User from "../models/User.js";
import WhatsAppAuth from "../models/WhatsAppAuth.js";
import WhatsAppSession from "../models/WhatsAppSession.js";

const MODELS = [
    Announcement,
    FastLipaWebhookLog,
    GroupSettings,
    Notification,
    Payment,
    Plan,
    SystemSettings,
    User,
    WhatsAppAuth,
    WhatsAppSession
];

function getAllowedTopLevelKeys(model) {
    const topLevel = new Set(["_id", "__v", "createdAt", "updatedAt", "__legacy"]);
    Object.keys(model.schema.paths).forEach((path) => {
        topLevel.add(path.split(".")[0]);
    });
    return topLevel;
}

async function cleanModelCollection(model) {
    const collName = model.collection.collectionName;
    const allowed = getAllowedTopLevelKeys(model);
    const cursor = model.collection.find({}, { projection: { _id: 1 } });

    let scanned = 0;
    let changed = 0;

    for await (const { _id } of cursor) {
        scanned++;
        const doc = await model.collection.findOne({ _id });
        if (!doc) continue;

        const extraKeys = Object.keys(doc).filter((key) => !allowed.has(key));
        if (extraKeys.length === 0) continue;

        const $set = {};
        const $unset = {};

        for (const key of extraKeys) {
            $set[`__legacy.${key}`] = doc[key];
            $unset[key] = "";
        }

        await model.collection.updateOne({ _id }, { $set, $unset });
        changed++;
    }

    await model.syncIndexes();
    return { collName, scanned, changed };
}

async function run() {
    try {
        await connectDB();
        const db = mongoose.connection.db;

        const actualCollections = (await db.listCollections().toArray()).map((c) => c.name);
        const expectedCollections = MODELS.map((m) => m.collection.collectionName);

        const extraCollections = actualCollections.filter((c) =>
            !expectedCollections.includes(c) && !c.startsWith("system.")
        );

        console.log("🧹 Safe model cleanup started...");
        console.log(`📚 Expected model collections: ${expectedCollections.length}`);
        console.log(`🗂️ Actual collections found: ${actualCollections.length}`);

        if (extraCollections.length > 0) {
            console.log("⚠️ Extra collections detected (not deleted, data preserved):");
            for (const name of extraCollections) console.log(`   - ${name}`);
        } else {
            console.log("✅ No extra collections detected.");
        }

        let totalScanned = 0;
        let totalChanged = 0;

        for (const model of MODELS) {
            const result = await cleanModelCollection(model);
            totalScanned += result.scanned;
            totalChanged += result.changed;
            console.log(`✅ ${result.collName}: scanned=${result.scanned}, cleaned=${result.changed}`);
        }

        console.log("🎯 Safe cleanup complete.");
        console.log(`   Total documents scanned: ${totalScanned}`);
        console.log(`   Documents with migrated extra fields: ${totalChanged}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("❌ Safe cleanup failed:", error);
        try {
            await mongoose.disconnect();
        } catch {
            // ignore
        }
        process.exit(1);
    }
}

run();

