import dotenv from "dotenv";
dotenv.config();

const token = process.env.FASTLIPA_API_TOKEN;
console.log("Token set:", !!token, token ? token.substring(0, 10) + "..." : "MISSING");

// Test 1: Balance check
try {
    console.log("\n--- Test 1: Balance ---");
    const resp = await fetch("https://api.fastlipa.com/api/balance", {
        headers: { "Authorization": "Bearer " + token }
    });
    const data = await resp.json();
    console.log("Status:", resp.status);
    console.log("Response:", JSON.stringify(data, null, 2));
} catch (e) {
    console.error("Balance error:", e.message);
}

// Test 2: Create transaction
try {
    console.log("\n--- Test 2: Create Transaction (Siku 200 TZS) ---");
    const resp2 = await fetch("https://api.fastlipa.com/api/create-transaction", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            number: "0785046741",
            amount: 200,
            name: "Test User"
        })
    });
    const data2 = await resp2.json();
    console.log("Status:", resp2.status);
    console.log("Response:", JSON.stringify(data2, null, 2));

    // Test 3: If we got a transaction ID, check its status
    const tranId = data2.tranid || data2.id || data2.transaction_id;
    if (tranId) {
        console.log("\n--- Test 3: Check Transaction Status ---");
        const resp3 = await fetch(
            `https://api.fastlipa.com/api/status-transaction?tranid=${tranId}`,
            { headers: { "Authorization": "Bearer " + token } }
        );
        const data3 = await resp3.json();
        console.log("Status:", resp3.status);
        console.log("Response:", JSON.stringify(data3, null, 2));
    }
} catch (e) {
    console.error("Transaction error:", e.message);
}

process.exit(0);
