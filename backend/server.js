import app from "./app.js";
import { PORT } from "./env.js";
import { createServer } from "http";
import { initSocket } from "./services/socketService.js";
import { connectDB } from "./lib/db.js";
import { initWhatsAppService, shutdownWhatsAppService } from "./services/whatsappService.js";
import { runCleanup, cleanLegacySessions } from "./services/cleanupService.js";
import { verifyPendingPayments } from "./services/paymentVerifier.js";
import cron from "node-cron";

const httpServer = createServer(app);
initSocket(httpServer);

// Startup sequence
async function start() {
    try {
        // 1. Connect to MongoDB
        await connectDB();

        // 2. Seed plans if needed
        const Plan = (await import("./models/Plan.js")).default;
        const planCount = await Plan.countDocuments();
        if (planCount === 0) {
            console.log("🌱 No plans found. Seeding...");
            await Plan.insertMany([
                { name: "Siku", slug: "siku", price: 200, currency: "TZS", durationDays: 1, maxSessions: 1, description: "Bot yako ya WhatsApp kwa siku moja" },
                { name: "Wiki", slug: "wiki", price: 700, currency: "TZS", durationDays: 7, maxSessions: 1, description: "Bot yako ya WhatsApp kwa wiki moja" },
                { name: "Mwezi", slug: "mwezi", price: 1200, currency: "TZS", durationDays: 30, maxSessions: 1, description: "Bot yako ya WhatsApp kwa mwezi mzima" }
            ]);
            console.log("✅ Plans seeded successfully.");
        }

        // 3. Clean legacy session folders
        cleanLegacySessions();

        // 4. Start HTTP server
        httpServer.listen(PORT, () => {
            console.log(`🚀 Tervux SaaS Platform running on port ${PORT}`);
        });

        // 5. Reconnect all active WhatsApp sessions from DB
        await initWhatsAppService();

        // 6. Schedule cleanup every 5 minutes
        cron.schedule("*/5 * * * *", () => {
            runCleanup().catch(err => console.error("Cleanup cron error:", err));
        });

        // 7. Schedule payment verification every 2 minutes
        cron.schedule("*/2 * * * *", () => {
            verifyPendingPayments().catch(err => console.error("Payment verify cron error:", err));
        });

        console.log("✅ All systems operational.");

    } catch (error) {
        console.error("❌ Startup failed:", error);
        process.exit(1);
    }
}

start();

// Global Error Handling
process.on("unhandledRejection", (reason, promise) => {
    console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
    console.error("🔥 Uncaught Exception:", err);
    if (
        err.message.includes("Unsupported state") ||
        err.message.includes("unable to authenticate") ||
        err.message.includes("fetch failed") ||
        err.code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
        console.warn("⚠️ Ignored fatal network/decryption error.");
    } else {
        console.error("🚀 Keeping server alive despite critical error.");
    }
});

// Graceful Shutdown
const shutdown = async () => {
    console.log("🛑 Server shutting down...");
    await shutdownWhatsAppService();
    setTimeout(() => process.exit(0), 1000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
