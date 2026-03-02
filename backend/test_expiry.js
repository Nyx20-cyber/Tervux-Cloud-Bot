import mongoose from "mongoose";
import dotenv from "dotenv";
import WhatsAppSession from "./models/WhatsAppSession.js";
import User from "./models/User.js";
import { runCleanup } from "./services/cleanupService.js";

// Load backend env explicitly since we're running from root
dotenv.config({ path: './backend/.env' });

async function run() {
    if (!process.env.MONGODB_URI) {
        console.error("MONGODB_URI not found in backend/.env!");
        process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");
    
    // 1. Get a user
    const user = await User.findOne();
    if (!user) {
        console.log("No user found.");
        process.exit(1);
    }
    
    // 2. Create a fake session
    const session = await WhatsAppSession.create({
        userId: user._id,
        phone: "1234567890",
        status: "active",
        subscription: {
            status: "active",
            activatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // Expired 2 days ago
        }
    });
    console.log("Created fake expired session:", session._id);
    
    // 3. Run cleanup
    await runCleanup();
    
    // 4. Verify deletion
    const check = await WhatsAppSession.findById(session._id);
    if (!check) {
        console.log("✅ SUCCESS: Expired session was automatically deleted!");
    } else {
        console.log("❌ FAILED: Session still exists in the database.");
    }
    
    process.exit(0);
}

run();
