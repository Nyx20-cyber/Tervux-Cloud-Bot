/**
 * FastLipa Payment Service
 * Integration with https://api.fastlipa.com
 */

const FASTLIPA_BASE_URL = "https://api.fastlipa.com/api";

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

/**
 * Create a payment transaction (send STK push to user's phone)
 * @param {string} phoneNumber - User's phone number (e.g., "0695123456")
 * @param {number} amount - Amount in TZS
 * @param {string} name - Payer name
 * @returns {object} Transaction response with tranid
 */
export async function createTransaction(phoneNumber, amount, name) {
    try {
        const response = await fetch(`${FASTLIPA_BASE_URL}/create-transaction`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                number: phoneNumber.replace(/[^0-9]/g, ""),
                amount: parseInt(amount),
                name: name || "Tervux User"
            })
        });

        const data = await response.json();
        console.log("💳 FastLipa create-transaction response:", JSON.stringify(data));
        return data;
    } catch (error) {
        console.error("❌ FastLipa create-transaction error:", error);
        throw new Error("Payment initiation failed: " + error.message);
    }
}

/**
 * Check transaction status
 * @param {string} tranId - Transaction ID (e.g., "pay_xxxxxxxx")
 * @returns {object} Transaction status
 */
export async function checkTransactionStatus(tranId) {
    try {
        const response = await fetch(
            `${FASTLIPA_BASE_URL}/status-transaction?tranid=${encodeURIComponent(tranId)}`,
            { headers: getHeaders() }
        );

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("❌ FastLipa status check error:", error);
        throw new Error("Payment status check failed: " + error.message);
    }
}

/**
 * Get account balance
 * @returns {object} Account info with balance
 */
export async function getBalance() {
    try {
        const response = await fetch(`${FASTLIPA_BASE_URL}/balance`, {
            headers: getHeaders()
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("❌ FastLipa balance error:", error);
        throw new Error("Balance check failed: " + error.message);
    }
}

/**
 * List transactions
 * @returns {object} Transaction history
 */
export async function listTransactions() {
    try {
        const response = await fetch(`${FASTLIPA_BASE_URL}/list-transactions`, {
            headers: getHeaders()
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("❌ FastLipa list error:", error);
        throw new Error("Transaction list failed: " + error.message);
    }
}
