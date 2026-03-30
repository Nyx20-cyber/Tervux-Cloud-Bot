import { timingSafeEqual } from "crypto";
import { Router } from "express";
import Payment from "../models/Payment.js";
import FastLipaWebhookLog from "../models/FastLipaWebhookLog.js";
import { extractFastLipaFields, settleCompletedPayment, settleFailedPayment } from "../services/paymentSettlement.js";

const router = Router();
const FASTLIPA_WEBHOOK_SECRET = String(process.env.FASTLIPA_WEBHOOK_SECRET || "").trim();

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const resolvePresentedSecret = (req, payload) => {
    const authorization = String(req.headers.authorization || "").trim();
    if (authorization.toLowerCase().startsWith("bearer ")) {
        return authorization.slice(7).trim();
    }

    return String(
        req.headers["x-fastlipa-secret"] ||
        req.headers["x-webhook-secret"] ||
        req.headers["x-api-key"] ||
        req.query.secret ||
        payload?.secret ||
        payload?.webhookSecret ||
        ""
    ).trim();
};

const isWebhookAuthorized = (req, payload) => {
    if (!FASTLIPA_WEBHOOK_SECRET) {
        if (process.env.NODE_ENV === "production") {
            console.error("[WEBHOOK] FASTLIPA_WEBHOOK_SECRET is missing in production.");
            return false;
        }
        return true;
    }

    const presentedSecret = resolvePresentedSecret(req, payload);
    return presentedSecret ? safeEqual(presentedSecret, FASTLIPA_WEBHOOK_SECRET) : false;
};

async function handleFastLipaWebhook(req, res) {
    const headers = req.headers || {};
    const bodyPayload = req.body || {};
    const queryPayload = req.query || {};
    const payload = Object.keys(bodyPayload).length ? bodyPayload : queryPayload;
    const method = req.method || "UNKNOWN";

    console.log("[WEBHOOK] Incoming FastLipa webhook", {
        method,
        path: req.originalUrl,
        hasBody: Object.keys(bodyPayload).length > 0,
        hasQuery: Object.keys(queryPayload).length > 0
    });

    try {
        const { transactionId, paymentStatus } = extractFastLipaFields(payload);
        console.log("[WEBHOOK] Parsed payload", {
            transactionId: transactionId || null,
            paymentStatus: paymentStatus || null
        });

        if (!isWebhookAuthorized(req, payload)) {
            await FastLipaWebhookLog.create({
                transactionId,
                paymentStatus,
                headers,
                payload,
                processingResult: "ignored",
                notes: "Webhook secret validation failed"
            });
            console.warn("[WEBHOOK] Ignored: invalid or missing webhook secret");
            return res.status(401).json({ received: false, error: "Unauthorized webhook" });
        }

        const payment = transactionId
            ? await Payment.findOne({ fastlipaTransactionId: transactionId }).select("_id status userId fastlipaTransactionId")
            : null;

        const log = await FastLipaWebhookLog.create({
            transactionId,
            paymentStatus,
            matchedPaymentId: payment?._id || null,
            headers,
            payload,
            processingResult: "received"
        });

        if (!transactionId) {
            log.processingResult = "ignored";
            log.notes = "Missing transaction id in webhook payload";
            await log.save();
            console.log("[WEBHOOK] Ignored: missing transactionId");
            return res.status(200).json({ received: true, ignored: true });
        }

        if (!payment) {
            log.processingResult = "ignored";
            log.notes = `No payment matched transaction ${transactionId}`;
            await log.save();
            console.log("[WEBHOOK] Ignored: payment not found", { transactionId });
            return res.status(200).json({ received: true, ignored: true });
        }

        if (paymentStatus === "COMPLETED" || paymentStatus === "SUCCESSFUL") {
            const result = await settleCompletedPayment(payment._id, payload, "webhook");
            log.processingResult = result.ok ? "completed" : "error";
            log.notes = `Completion result: ${result.state}`;
            await log.save();
            console.log("[WEBHOOK] Completion handled", {
                transactionId,
                paymentId: payment._id.toString(),
                state: result.state
            });
            return res.status(200).json({ received: true, status: result.state });
        }

        if (["FAILED", "EXPIRED", "CANCELLED", "REJECTED"].includes(paymentStatus)) {
            const failureStatus = paymentStatus === "CANCELLED" || paymentStatus === "REJECTED" ? "cancelled" : "failed";
            const failureReason = failureStatus === "cancelled"
                ? "Payment was cancelled."
                : `Payment failed (${paymentStatus}).`;
            const result = await settleFailedPayment(payment._id, failureStatus, failureReason, payload);
            log.processingResult = result.ok ? "failed" : "error";
            log.notes = `Failure result: ${result.state}`;
            await log.save();
            console.log("[WEBHOOK] Failure handled", {
                transactionId,
                paymentId: payment._id.toString(),
                state: result.state
            });
            return res.status(200).json({ received: true, status: result.state });
        }

        log.processingResult = "ignored";
        log.notes = `Unhandled payment status: ${paymentStatus || "UNKNOWN"}`;
        await log.save();
        console.log("[WEBHOOK] Ignored: unhandled status", { transactionId, paymentStatus });
        return res.status(200).json({ received: true, ignored: true });
    } catch (error) {
        console.error("FastLipa webhook error:", error);
        try {
            await FastLipaWebhookLog.create({
                headers,
                payload,
                processingResult: "error",
                notes: error.message || "Unknown webhook error"
            });
        } catch {
            // Ignore secondary logging failure
        }
        return res.status(200).json({ received: true, error: false });
    }
}

router.get("/", (req, res) => {
    console.log("[WEBHOOK] Health/ping hit", {
        method: req.method,
        path: req.originalUrl,
        query: req.query
    });
    return res.status(200).json({ ok: true, service: "fastlipa-webhook" });
});

router.post("/", handleFastLipaWebhook);
router.get("/fastlipa", handleFastLipaWebhook);
router.post("/fastlipa", handleFastLipaWebhook);

export default router;
