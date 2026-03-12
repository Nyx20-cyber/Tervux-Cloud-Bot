import app from "./app.js";
import { PORT } from "./env.js";
import { createServer } from "http";
import { initSocket } from "./services/socketService.js";
import { connectDB } from "./lib/db.js";
import { initWhatsAppService, sessionManager, shutdownWhatsAppService } from "./services/whatsappService.js";
import { runCleanup } from "./services/cleanupService.js";
import { verifyPendingPayments } from "./services/paymentVerifier.js";
import { runWeeklyKingCeremony } from "./services/referralKingService.js";
import { runResellerNudge } from "./services/resellerNudgeService.js";
import { runGroupPromotionBroadcast } from "./services/groupPromotionBroadcastService.js";
import WhatsAppAuth from "./models/WhatsAppAuth.js";
import { closeRedis, initRedis } from "./lib/redis.js";
import cron from "node-cron";

const httpServer = createServer(app);
initSocket(httpServer);
const EAT_TIMEZONE = "Africa/Dar_es_Salaam";

let lastSuppressedNoiseAt = 0;
const flattenLogArgs = (args = []) =>
    args
        .map((v) => {
            if (typeof v === "string") return v;
            if (v instanceof Error) return `${v.name}: ${v.message}`;
            try { return JSON.stringify(v); } catch { return String(v); }
        })
        .join(" ")
        .toLowerCase();

const isWaNoiseLog = (args = []) => {
    const text = flattenLogArgs(args);
    return (
        text.includes("failed to decrypt message with any known session") ||
        text.includes("bad mac") ||
        text.includes("messagecountererror") ||
        text.includes("key used already or never filled") ||
        text.includes("removing old closed session: sessionentry")
    );
};

const patchConsole = (method) => {
    const original = console[method].bind(console);
    console[method] = (...args) => {
        if (isWaNoiseLog(args)) {
            const now = Date.now();
            if (now - lastSuppressedNoiseAt > 60_000) {
                lastSuppressedNoiseAt = now;
                original("⚠️ Suppressed repeated WhatsApp decrypt/session noise logs.");
            }
            return;
        }
        original(...args);
    };
};

patchConsole("log");
patchConsole("warn");
patchConsole("error");

const getEatClock = () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: EAT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
        dateKey: `${map.year}-${map.month}-${map.day}`,
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
};

let lastGroupBroadcastDateKey = null;
let lastResellerNudgeDateKey = null;
let schedulerTickRunning = false;

async function runDailySchedulers() {
    if (schedulerTickRunning) return;
    schedulerTickRunning = true;
    try {
        const now = getEatClock();

        // Midnight group broadcast window (00:00-00:14 EAT), once per date.
        if (
            now.hour === 0 &&
            now.minute < 15 &&
            lastGroupBroadcastDateKey !== now.dateKey
        ) {
            lastGroupBroadcastDateKey = now.dateKey;
            console.log(`📣 [Scheduler] Triggering group broadcast for ${now.dateKey} (${EAT_TIMEZONE}).`);
            await runGroupPromotionBroadcast();
        }

        // 03:00 reseller nudge window (03:00-03:14 EAT), once per date.
        if (
            now.hour === 3 &&
            now.minute < 15 &&
            lastResellerNudgeDateKey !== now.dateKey
        ) {
            lastResellerNudgeDateKey = now.dateKey;
            console.log(`📣 [Scheduler] Triggering reseller nudge for ${now.dateKey} (${EAT_TIMEZONE}).`);
            await runResellerNudge();
        }
    } catch (error) {
        console.error("Daily scheduler tick error:", error);
    } finally {
        schedulerTickRunning = false;
    }
}

// Startup sequence
async function start() {
    try {
        // 1. Connect to MongoDB
        await connectDB();
        await initRedis();

        // 2. Seed plans if needed
        const Plan = (await import("./models/Plan.js")).default;
        const planCount = await Plan.countDocuments();
        if (planCount === 0) {
            console.log("🌱 No plans found. Seeding...");
            await Plan.insertMany([
                { name: "50 Coins", slug: "50-coins", price: 1500, currency: "TZS", coinsAmount: 50, description: "50 Coins — Deploy 1 Bot" },
                { name: "100 Coins", slug: "100-coins", price: 2000, currency: "TZS", coinsAmount: 100, description: "100 Coins — Deploy 2 Bots" },
                { name: "250 Coins", slug: "250-coins", price: 3000, currency: "TZS", coinsAmount: 250, description: "250 Coins — Deploy 5 Bots" }
            ]);
            console.log("✅ Plans seeded successfully.");
        }

        // 4. Start HTTP server
        httpServer.listen(PORT, () => {
            console.log(`🚀 Tervux SaaS Platform running on port ${PORT}`);
        });

        // 5. Reconnect all active WhatsApp sessions from DB
        await initWhatsAppService();

        // 6. Cleanup every 5 minutes (interval-based for reliability)
        setInterval(() => {
            runCleanup().catch(err => console.error("Cleanup interval error:", err));
        }, 5 * 60 * 1000);
        // Immediate startup cleanup pass
        await runCleanup();
        // Keep cron as secondary safety trigger
        cron.schedule("*/5 * * * *", () => {
            runCleanup().catch(err => console.error("Cleanup cron error:", err));
        });

        // 8. Weekly Referral King Ceremony — every Sunday at 00:00
        cron.schedule("0 0 * * 0", () => {
            runWeeklyKingCeremony().catch(err => console.error("King ceremony cron error:", err));
        });
        console.log("👑 Weekly Referral King ceremony scheduled for every Sunday at midnight.");

        // 9/10. Daily schedulers (timezone-safe minute tick with once-per-day guards)
        setInterval(() => {
            runDailySchedulers().catch(err => console.error("Daily scheduler error:", err));
        }, 60_000);
        // Run one immediate tick on startup so within-window restarts don't miss schedules.
        await runDailySchedulers();
        console.log(`📣 Daily schedulers active (Group: 00:00 EAT, Reseller: 03:00 EAT, tz=${EAT_TIMEZONE}).`);

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
let lastCryptoNoiseAt = 0;
const isCryptoNoise = (msg = "") => {
    const text = String(msg).toLowerCase();
    return (
        text.includes("bad mac") ||
        text.includes("failed to decrypt message with any known session") ||
        text.includes("session error")
    );
};

const extractSignalSessionKey = (text = "") => {
    const match = String(text).match(/(\d{6,}_\d+\.\d+)/);
    return match?.[1] || "";
};

const attemptAutoRepairFromCryptoNoise = async (reason) => {
    const message = reason?.message || String(reason || "");
    const stack = reason?.stack || "";
    const text = `${message}\n${stack}`;
    const signalKeyId = extractSignalSessionKey(text);
    if (!signalKeyId) return;

    const rows = await WhatsAppAuth.find({
        type: "session",
        id: signalKeyId
    }).select("sessionId").limit(5);
    if (!rows.length) return;

    for (const row of rows) {
        const sessionId = String(row.sessionId || "");
        if (!sessionId) continue;
        (async () => {
            try {
                await sessionManager.autoRepairSession(sessionId, `bad_mac_${signalKeyId}`);
            } catch (error) {
                console.error(`❌ [WA Repair] Auto-repair failed for ${sessionId}:`, error.message);
            }
        })();
    }
};

process.on("unhandledRejection", (reason, promise) => {
    const msg = reason?.message || reason;
    if (isCryptoNoise(msg)) {
        attemptAutoRepairFromCryptoNoise(reason).catch((error) => {
            console.error("Auto-repair (unhandledRejection) error:", error.message);
        });
        const now = Date.now();
        if (now - lastCryptoNoiseAt > 30_000) {
            lastCryptoNoiseAt = now;
            console.warn("⚠️ Ignored transient WhatsApp crypto/decrypt noise (Bad MAC).");
        }
        return;
    }
    console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
    if (isCryptoNoise(err?.message)) {
        attemptAutoRepairFromCryptoNoise(err).catch((error) => {
            console.error("Auto-repair (uncaughtException) error:", error.message);
        });
        const now = Date.now();
        if (now - lastCryptoNoiseAt > 30_000) {
            lastCryptoNoiseAt = now;
            console.warn("⚠️ Ignored transient WhatsApp crypto/decrypt noise (Bad MAC).");
        }
        return;
    }
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
    await closeRedis();
    setTimeout(() => process.exit(0), 1000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
