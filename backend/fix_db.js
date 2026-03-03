import { connectDB } from "./lib/db.js";
import WhatsAppSession from "./models/WhatsAppSession.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await connectDB();

        console.log("Running update...");
        const result = await WhatsAppSession.updateMany(
            { status: "expired", expiresAt: { $gt: new Date() } },
            { $set: { status: "active" } }
        );

        console.log("Fixed sessions:", result.modifiedCount);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit(0);
    }
}

run();
