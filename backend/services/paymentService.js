/**
 * FastLipa Payment Service
 * Integration with https://api.fastlipa.com
 */

const FASTLIPA_BASE_URL = String(process.env.FASTLIPA_BASE_URL || "https://api.fastlipa.com/api").replace(/\/+$/, "");
const FASTLIPA_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.FASTLIPA_REQUEST_TIMEOUT_MS || "15000", 10);
const FASTLIPA_STATUS_MAX_RETRIES = Number.parseInt(process.env.FASTLIPA_STATUS_MAX_RETRIES || "3", 10);
const FASTLIPA_RETRY_BASE_MS = Number.parseInt(process.env.FASTLIPA_RETRY_BASE_MS || "1200", 10);
const FASTLIPA_DEFAULT_MAX_RETRIES = Number.parseInt(process.env.FASTLIPA_MAX_RETRIES || "3", 10);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTransportError(error) {
    const cause = error?.cause;
    const causeCode = String(cause?.code || "").toUpperCase();
    const code = String(error?.code || causeCode || "").toUpperCase();
    const message = String(error?.message || cause?.message || "Request failed");

    if (code === "EHOSTUNREACH" || code === "ENETUNREACH") {
        return `${message} (FastLipa host is unreachable from this server: ${code})`;
    }

    if (code === "EAI_AGAIN" || code === "ENOTFOUND") {
        return `${message} (DNS lookup for FastLipa failed: ${code})`;
    }

    if (code === "ECONNREFUSED") {
        return `${message} (FastLipa refused the TCP connection: ${code})`;
    }

    if (code === "ECONNRESET") {
        return `${message} (FastLipa connection was reset: ${code})`;
    }

    if (code === "ETIMEDOUT") {
        return `${message} (FastLipa request timed out: ${code})`;
    }

    return message;
}

function isTransientFastlipaError(error) {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || error?.cause?.code || "").toUpperCase();
    if (error?.isTransient) return true;
    return (
        message.includes("fetch failed") ||
        message.includes("timed out") ||
        message.includes("timeout") ||
        message.includes("socket hang up") ||
        code === "EHOSTUNREACH" ||
        code === "ENETUNREACH" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === "EAI_AGAIN" ||
        code === "ENOTFOUND"
    );
}

async function fastlipaFetchJson(url, options = {}, config = {}) {
    const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : FASTLIPA_REQUEST_TIMEOUT_MS;
    const maxRetries = Number.isFinite(config.maxRetries) ? config.maxRetries : 1;

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);

            let data = null;
            try {
                data = await response.json();
            } catch {
                data = null;
            }

            if (!response.ok) {
                const err = new Error(data?.message || `FastLipa HTTP ${response.status}`);
                err.code = `HTTP_${response.status}`;
                err.httpStatus = response.status;
                err.payload = data;
                err.isTransient = response.status === 429 || response.status >= 500;
                throw err;
            }

            return data;
        } catch (error) {
            clearTimeout(timeout);
            const isAbort = error?.name === "AbortError";
            if (isAbort) {
                const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
                timeoutErr.code = "ETIMEDOUT";
                timeoutErr.isTransient = true;
                lastError = timeoutErr;
            } else {
                if (isTransientFastlipaError(error)) {
                    error.isTransient = true;
                }
                error.code = error?.code || error?.cause?.code || error?.code;
                lastError = error;
            }

            if (attempt < maxRetries && lastError?.isTransient) {
                const delayMs = FASTLIPA_RETRY_BASE_MS * Math.pow(2, attempt - 1);
                await sleep(delayMs);
                continue;
            }
            throw lastError;
        }
    }
    throw lastError || new Error("FastLipa request failed");
}

function getHeaders() {
    const token = process.env.FASTLIPA_API_TOKEN;
    if (!token) {
        throw new Error("FASTLIPA_API_TOKEN not configured");
    }
    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };
}

function createGatewayError(prefix, error) {
    const wrapped = new Error(`${prefix}: ${formatTransportError(error)}`);
    wrapped.code = error?.code || error?.cause?.code || "FASTLIPA_REQUEST_FAILED";
    wrapped.isTransient = !!error?.isTransient || isTransientFastlipaError(error);
    wrapped.cause = error;
    return wrapped;
}

/**
 * Create a payment transaction (send STK push to user's phone)
 * @param {string} phoneNumber - User's phone number (e.g., "0695123456")
 * @param {number} amount - Amount in TZS
 * @param {string} name - Payer name
 * @returns {object} Transaction response with tranid
 */
export async function createTransaction(phoneNumber, amount, name) {
    try {
        const data = await fastlipaFetchJson(
            `${FASTLIPA_BASE_URL}/create-transaction`,
            {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({
                    number: phoneNumber.replace(/[^0-9]/g, ""),
                    amount: Number.parseInt(amount, 10),
                    name: name || "Tervux User"
                })
            },
            {
                timeoutMs: FASTLIPA_REQUEST_TIMEOUT_MS,
                maxRetries: Math.max(1, FASTLIPA_DEFAULT_MAX_RETRIES)
            }
        );
        console.log("💳 FastLipa create-transaction response:", JSON.stringify(data));

        return data;
    } catch (error) {
        console.error("❌ FastLipa create-transaction error:", error);
        throw createGatewayError("Payment initiation failed", error);
    }
}

/**
 * Check transaction status
 * @param {string} tranId - Transaction ID (e.g., "pay_xxxxxxxx")
 * @returns {object} Transaction status
 */
export async function checkTransactionStatus(tranId) {
    try {
        const data = await fastlipaFetchJson(
            `${FASTLIPA_BASE_URL}/status-transaction?tranid=${encodeURIComponent(tranId)}`,
            { headers: getHeaders() },
            {
                timeoutMs: FASTLIPA_REQUEST_TIMEOUT_MS,
                maxRetries: Math.max(1, FASTLIPA_STATUS_MAX_RETRIES)
            }
        );

        return data;
    } catch (error) {
        console.error("❌ FastLipa status check error:", error);
        throw createGatewayError("Payment status check failed", error);
    }
}

/**
 * Get account balance
 * @returns {object} Account info with balance
 */
export async function getBalance() {
    try {
        return await fastlipaFetchJson(
            `${FASTLIPA_BASE_URL}/balance`,
            { headers: getHeaders() },
            {
                timeoutMs: FASTLIPA_REQUEST_TIMEOUT_MS,
                maxRetries: Math.max(1, FASTLIPA_DEFAULT_MAX_RETRIES)
            }
        );
    } catch (error) {
        console.error("❌ FastLipa balance error:", error);
        throw createGatewayError("Balance check failed", error);
    }
}

/**
 * List transactions
 * @returns {object} Transaction history
 */
export async function listTransactions() {
    try {
        return await fastlipaFetchJson(
            `${FASTLIPA_BASE_URL}/list-transactions`,
            { headers: getHeaders() },
            {
                timeoutMs: FASTLIPA_REQUEST_TIMEOUT_MS,
                maxRetries: Math.max(1, FASTLIPA_DEFAULT_MAX_RETRIES)
            }
        );
    } catch (error) {
        console.error("❌ FastLipa list error:", error);
        throw createGatewayError("Transaction list failed", error);
    }
}
