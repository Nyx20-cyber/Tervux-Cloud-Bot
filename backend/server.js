import app from "./app.js";
import { PORT } from "./env.js";
import { createServer } from "http";
import { initSocket } from "./services/socketService.js";
import { connectDB } from "./lib/db.js";
import { initWhatsAppService, shutdownWhatsAppService } from "./services/whatsappService.js";
import { runCleanup } from "./services/cleanupService.js";
import { verifyPendingPayments } from "./services/paymentVerifier.js";
import { runWeeklyKingCeremony } from "./services/referralKingService.js";
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
                { name: "50 Coins", slug: "50-coins", price: 1500, currency: "TZS", durationDays: 0, coinsAmount: 50, maxSessions: 1, description: "50 Coins — Deploy 1 Bot" },
                { name: "100 Coins", slug: "100-coins", price: 2000, currency: "TZS", durationDays: 0, coinsAmount: 100, maxSessions: 1, description: "100 Coins — Deploy 2 Bots" },
                { name: "250 Coins", slug: "250-coins", price: 3000, currency: "TZS", durationDays: 0, coinsAmount: 250, maxSessions: 1, description: "250 Coins — Deploy 5 Bots" }
            ]);
            console.log("✅ Plans seeded successfully.");
        }

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

        // 8. Weekly Referral King Ceremony — every Sunday at 00:00
        cron.schedule("0 0 * * 0", () => {
            runWeeklyKingCeremony().catch(err => console.error("King ceremony cron error:", err));
        });
        console.log("👑 Weekly Referral King ceremony scheduled for every Sunday at midnight.");

        // 7. Check pending payments every 15 seconds for near-instant user feedback
        setInterval(() => {
            verifyPendingPayments().catch(err => console.error("Payment verify error:", err));
        }, 15000);

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
