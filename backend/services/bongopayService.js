const BONGOPAY_BASE_URL = String(process.env.BONGOPAY_BASE_URL || "https://bongopay.io").replace(/\/+$/, "");
const BONGOPAY_TIMEOUT_MS = Number.parseInt(process.env.BONGOPAY_TIMEOUT_MS || "20000", 10);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function debugLog(...args) {
    if (!IS_PRODUCTION) {
        console.log(...args);
    }
}

function getHeaders() {
    const apiKey = process.env.BONGOPAY_API_KEY;
    if (!apiKey) {
        throw new Error("BONGOPAY_API_KEY not configured");
    }
    return {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey
    };
}

function decodeBase64Url(value = "") {
    const input = String(value || "").trim();
    if (!input) return "";
    try {
        const decoded = Buffer.from(input, "base64").toString("utf8").trim();
        if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch {
        // Ignore decoding failure and fallback below.
    }
    return input;
}

function isValidHttpUrl(value = "") {
    try {
        const url = new URL(String(value || "").trim());
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function validateCardPaymentPayload(payload = {}) {
    const missingFields = [];

    if (!String(payload.phone || "").trim()) missingFields.push("phone");
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) < 1000) missingFields.push("amount");
    if (!String(payload.order_id || "").trim()) missingFields.push("order_id");
    if (!String(payload.callback_url || "").trim() || !isValidHttpUrl(payload.callback_url)) missingFields.push("callback_url");
    if (!String(payload.redirect_url || "").trim() || !isValidHttpUrl(payload.redirect_url)) missingFields.push("redirect_url");
    if (!String(payload.cancel_url || "").trim() || !isValidHttpUrl(payload.cancel_url)) missingFields.push("cancel_url");

    if (missingFields.length > 0) {
        throw new Error(`BongoPay card payment payload is missing or invalid required fields: ${missingFields.join(", ")}`);
    }
}

async function bongopayFetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), BONGOPAY_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const rawText = await response.text();
        let data = null;
        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch {
            data = null;
        }

        if (!response.ok) {
            const gatewayMessage = data?.message || data?.error || data?.detail || "";
            throw new Error(gatewayMessage
                ? `BongoPay HTTP ${response.status} on ${url}: ${gatewayMessage}`
                : `BongoPay HTTP ${response.status} on ${url}`);
        }
        return data || { rawText };
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`BongoPay request timed out after ${BONGOPAY_TIMEOUT_MS}ms`);
        }
        console.error("BongoPay request failed:", {
            url,
            method: options?.method || "GET",
            message: error?.message || String(error)
        });
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export function normalizeBongoPayPhone(value = "") {
    return String(value || "").replace(/\D/g, "");
}

export async function createCardPayment({
    orderId,
    buyerPhone,
    amount,
    callbackUrl,
    redirectUrl,
    cancelUrl
}) {
    const payload = {
        phone: buyerPhone,
        amount: Number(amount),
        order_id: orderId,
        callback_url: callbackUrl,
        redirect_url: redirectUrl,
        cancel_url: cancelUrl
    };

    validateCardPaymentPayload(payload);
    debugLog("[BongoPay] Card payment payload validated:", {
        orderId: payload.order_id,
        amount: payload.amount,
        phone: payload.phone,
        hasCallbackUrl: Boolean(payload.callback_url),
        hasRedirectUrl: Boolean(payload.redirect_url),
        hasCancelUrl: Boolean(payload.cancel_url)
    });

    const result = await bongopayFetchJson(`${BONGOPAY_BASE_URL}/api/v1/payment/create/card-payment`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });

    const first = Array.isArray(result?.data)
        ? (result.data[0] || {})
        : (result?.data && typeof result.data === "object" ? result.data : {});
    const paymentGatewayUrlRaw =
        first.payment_gateway_url ||
        first.payment_link ||
        first.checkout_url ||
        result.payment_gateway_url ||
        result.payment_link ||
        result.checkout_url ||
        "";
    const paymentUrl = decodeBase64Url(paymentGatewayUrlRaw);
    const reference = String(result.reference || first.payment_token || "").trim();
    const resultCode = String(result.resultcode || "").trim();
    const resultStatus = String(result.result || result.status || "").trim().toUpperCase();
    const gatewayMessage = String(result.message || "").trim();

    return {
        ...result,
        payment_link: paymentUrl,
        tx_ref: reference,
        resultcode: resultCode,
        result_status: resultStatus,
        gateway_message: gatewayMessage
    };
}

export async function checkOrderStatus(orderId) {
    const url = `${BONGOPAY_BASE_URL}/api/v1/payment/status/${encodeURIComponent(orderId)}`;
    return bongopayFetchJson(url, {
        method: "GET",
        headers: getHeaders()
    });
}

export function verifyBongoPayWebhook(headers = {}) {
    const configuredKey = process.env.BONGOPAY_API_KEY;
    if (!configuredKey) return false;
    const receivedKey = headers["x-api-key"] || headers["X-API-KEY"] || headers["x-api-Key"] || headers["X-Api-Key"];
    return String(receivedKey || "").trim() === String(configuredKey).trim();
}

export function extractBongoPayStatusPayload(payload = {}) {
    const orderId = String(payload.order_id || payload.orderId || "").trim();
    const paymentStatus = String(payload.payment_status || payload.status || "").trim().toUpperCase();
    const reference = String(payload.reference || payload.transaction_id || payload.tx_ref || "").trim();
    return { orderId, paymentStatus, reference, payload };
}

export function extractBongoPayOrderStatus(statusPayload = {}) {
    const orderId = String(statusPayload.order_id || "").trim();
    const paymentStatus = String(statusPayload.payment_status || statusPayload.status || "").trim().toUpperCase();
    const reference = String(statusPayload.transaction_id || statusPayload.reference || "").trim();
    return { orderId, paymentStatus, reference, data: statusPayload };
}
