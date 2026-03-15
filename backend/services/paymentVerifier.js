import Payment from "../models/Payment.js";
import { checkTransactionStatus } from "./paymentService.js";
import { emitToUser } from "./socketService.js";
import { settleCompletedPayment, settleFailedPayment } from "./paymentSettlement.js";
import { checkOrderStatus, extractBongoPayOrderStatus } from "./bongopayService.js";

function normalizeGatewayStatus(statusValue) {
    const status = String(statusValue || "").trim().toLowerCase();
    if (status === "completed" || status === "successful" || status === "success") return "COMPLETED";
    if (status === "failed" || status === "failure" || status === "expired") return "FAILED";
    if (status === "cancelled" || status === "canceled" || status === "usercancelled" || status === "rejected") return "CANCELLED";
    if (status === "pending" || status === "processing" || status === "in_progress" || status === "inprogress") return "PENDING";
    return "";
}

/**
 * Background Payment Verifier
 * - Skips payments younger than 30s (let user respond to initial prompt)
 * - Polls status at controlled intervals while payment remains pending
 * - Auto-cancels only after a longer timeout to avoid false cancellations
 */
export async function verifyPendingPayments() {
    try {
        const MIN_WAIT_MS = 30_000;
        const FAST_POLL_INTERVAL_MS = 45_000;
        const SLOW_POLL_INTERVAL_MS = 5 * 60 * 1000;
        const FAST_POLL_WINDOW_MS = 15 * 60 * 1000;
        const CANCEL_TIMEOUT_MS = 30 * 60 * 1000;
        const pendingPayments = await Payment.find({
            status: "pending"
        }).populate("planId");

        if (pendingPayments.length === 0) return;

        console.log(`💳 [PaymentVerifier] Checking ${pendingPayments.length} pending payment(s)...`);

        for (const payment of pendingPayments) {
            const paymentAge = Date.now() - new Date(payment.createdAt).getTime();
            const lastPolledAt = payment.gatewayResponse?.lastPolledAt
                ? new Date(payment.gatewayResponse.lastPolledAt).getTime()
                : 0;
            const sinceLastPoll = Date.now() - lastPolledAt;
            const referenceLabel = payment.fastlipaTransactionId || payment.gatewayReference || payment._id.toString();

            try {
                if (paymentAge < MIN_WAIT_MS) {
                    console.log(`   ⏳ [${referenceLabel}] Waiting... (${Math.round(paymentAge / 1000)}s old)`);
                    continue;
                }

                if (paymentAge > CANCEL_TIMEOUT_MS) {
                    await settleFailedPayment(
                        payment._id,
                        "cancelled",
                        "Payment timed out after 30 minutes.",
                        {
                            provider: payment.provider,
                            autoCancelledAt: new Date().toISOString(),
                            timeoutMs: CANCEL_TIMEOUT_MS
                        }
                    );
                    console.log(`   ⏰ [${referenceLabel}] Auto-cancelled after ${Math.round(paymentAge / 1000)}s.`);
                    continue;
                }

                const pollInterval = paymentAge <= FAST_POLL_WINDOW_MS
                    ? FAST_POLL_INTERVAL_MS
                    : SLOW_POLL_INTERVAL_MS;

                if (sinceLastPoll < pollInterval) {
                    continue;
                }

                if (payment.provider === "bongopay") {
                    const statusResult = await checkOrderStatus(payment._id.toString());
                    const { paymentStatus, reference, data } = extractBongoPayOrderStatus(statusResult);
                    const txStatus = normalizeGatewayStatus(paymentStatus);

                    payment.gatewayResponse = {
                        ...(payment.gatewayResponse || {}),
                        lastPolledAt: new Date().toISOString(),
                        consecutivePollFailures: 0,
                        lastStatusPayload: statusResult
                    };

                    if (reference && payment.gatewayReference !== reference) {
                        payment.gatewayReference = reference;
                    }

                    console.log(`   💳 [${referenceLabel}] POLL check — Provider: "BongoPay", Transaction: "${txStatus || paymentStatus || "UNKNOWN"}"`);

                    if (txStatus === "COMPLETED") {
                        const result = await settleCompletedPayment(payment._id, { provider: "bongopay", reference, data }, "polling_bongopay");
                        if (result.state === "completed") {
                            console.log(`   ✅ [${referenceLabel}] Payment completed and coins credited.`);
                        } else {
                            console.log(`   ℹ️ [${referenceLabel}] Completion state: ${result.state}`);
                        }
                        continue;
                    }

                    if (txStatus === "FAILED" || txStatus === "CANCELLED") {
                        const failureStatus = txStatus === "CANCELLED" ? "cancelled" : "failed";
                        const failureReason = failureStatus === "cancelled"
                            ? "Card payment was cancelled."
                            : "Card payment failed.";
                        await settleFailedPayment(payment._id, failureStatus, failureReason, { provider: "bongopay", reference, data });
                        console.log(`   ❌ [${referenceLabel}] ${failureStatus}: ${txStatus}`);
                        continue;
                    }

                    await payment.save();
                    continue;
                }

                if (!payment.fastlipaTransactionId) {
                    continue;
                }

                const statusResult = await checkTransactionStatus(payment.fastlipaTransactionId);
                const txStatus = (statusResult.data?.payment_status || statusResult.data?.status || "").toUpperCase();

                payment.gatewayResponse = {
                    ...(payment.gatewayResponse || {}),
                    lastPolledAt: new Date().toISOString(),
                    consecutivePollFailures: 0,
                    lastStatusPayload: statusResult
                };

                console.log(`   💳 [${payment.fastlipaTransactionId}] POLL check — API: "${statusResult.status}", Transaction: "${txStatus}"`);

                if (txStatus === "COMPLETED" || txStatus === "SUCCESSFUL") {
                    const result = await settleCompletedPayment(payment._id, statusResult, "polling");
                    if (result.state === "completed") {
                        console.log(`   ✅ [${payment.fastlipaTransactionId}] Payment completed and coins credited.`);
                    } else {
                        console.log(`   ℹ️ [${payment.fastlipaTransactionId}] Completion state: ${result.state}`);
                    }
                    continue;
                }

                if (txStatus === "FAILED" || txStatus === "EXPIRED" || txStatus === "CANCELLED" || txStatus === "REJECTED") {
                    const failureStatus = txStatus === "CANCELLED" || txStatus === "REJECTED" ? "cancelled" : "failed";
                    const failureReason = failureStatus === "cancelled"
                        ? "Payment was cancelled."
                        : `Payment failed (${txStatus}).`;
                    await settleFailedPayment(payment._id, failureStatus, failureReason, statusResult);
                    console.log(`   ❌ [${payment.fastlipaTransactionId}] ${failureStatus}: ${txStatus}`);
                    continue;
                }

                await payment.save();

            } catch (err) {
                const isTransient = !!err?.isTransient || /fetch failed|timed out|timeout|etimedout|econnreset|eai_again/i.test(String(err?.message || ""));
                payment.gatewayResponse = {
                    ...(payment.gatewayResponse || {}),
                    lastPolledAt: new Date().toISOString(),
                    lastErrorAt: new Date().toISOString(),
                    lastErrorMessage: String(err?.message || "Unknown FastLipa polling error"),
                    consecutivePollFailures: Number(payment.gatewayResponse?.consecutivePollFailures || 0) + 1
                };
                await payment.save();

                const failCount = Number(payment.gatewayResponse?.consecutivePollFailures || 1);
                if (!isTransient || failCount === 1 || failCount % 5 === 0) {
                    const levelTag = isTransient ? "⚠️" : "❌";
                    console[isTransient ? "warn" : "error"](
                        `   ${levelTag} [${referenceLabel}] Check failed (x${failCount}): ${err.message}`
                    );
                }
            }

            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (error) {
        console.error("❌ [PaymentVerifier] Error:", error.message);
    }
}
