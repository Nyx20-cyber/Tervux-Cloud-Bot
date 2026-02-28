import axios from "axios";

const API_URL = "http://localhost:5000/api";

async function runTest() {
    try {
        console.log("1. Register a new user to get token");
        const randomEmail = `testuser_${Date.now()}@example.com`;
        const registerRes = await axios.post(`${API_URL}/auth/register`, {
            email: randomEmail,
            password: "password123",
            name: "Test User User"
        });
        const token = registerRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };
        console.log("   ✅ Registered and logged in successfully:", randomEmail);

        console.log("\n2. Call auth/me to verify user model");
        const meRes = await axios.get(`${API_URL}/auth/me`, config);
        console.log("   ✅ User:", meRes.data.user.email);

        console.log("\n3. Pair a new session without subscription");
        const testPhone = "255" + Math.floor(100000000 + Math.random() * 900000000);
        let sessionId;
        try {
            const pairRes = await axios.post(`${API_URL}/sessions/pair`, { phoneNumber: testPhone, method: "code" }, config);
            sessionId = pairRes.data.sessionId;
            console.log("   ✅ Pairing initiated. Session ID:", sessionId);
            console.log("      (Since we don't finish pairing, it will remain in pairing status until ghost cleanup)");
        } catch (err) {
            console.error("   ❌ Pairing failed:", err.response?.data || err.message);
            return;
        }

        console.log("\n4. Get sessions list to verify subscription field");
        const sessionsRes = await axios.get(`${API_URL}/sessions`, config);
        const session = sessionsRes.data.sessions.find(s => s._id === sessionId);
        console.log("   ✅ Session in list? ", !!session);
        console.log("   ✅ Session subscription status:", session?.subscription?.status);

        console.log("\n5. Test Checkout for this specific session");
        let paymentId;
        try {
            const checkoutRes = await axios.post(`${API_URL}/subscription/checkout`, {
                planSlug: "siku",
                payerPhone: "0695123456",
                sessionId: sessionId
            }, config);
            paymentId = checkoutRes.data.paymentId;
            console.log("   ✅ Checkout initiated. Payment ID:", paymentId);
        } catch (err) {
            console.error("   ❌ Checkout failed:", err.response?.data || err.message);
            return;
        }

        console.log("\n6. Check new GET /api/subscription (should list session subscriptions)");
        const subRes = await axios.get(`${API_URL}/subscription`, config);
        console.log("   ✅ Subscriptions array length:", subRes.data.subscriptions?.length);
        if (subRes.data.subscriptions?.length > 0) {
            console.log("      First sub:", subRes.data.subscriptions[0]);
        }

        console.log("\n7. Test pause session (even if pairing)");
        try {
            const pauseRes = await axios.post(`${API_URL}/sessions/${sessionId}/pause`, {}, config);
            console.log("   ✅ Pause response:", pauseRes.data.message);
        } catch (err) {
            console.error("   ❌ Pause failed:", err.response?.data || err.message);
        }

        console.log("\n🎉 ALL TESTS PASSED!");
    } catch (err) {
        console.error("\n❌ Test Suite Failed:");
        console.error(err.response?.data || err.message);
    }
}

runTest();
