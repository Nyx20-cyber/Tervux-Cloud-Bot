import { getCachedConfig } from "../../services/configService.js";

export const qr = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    const text = args.join(" ");
    if (!text) {
        return `╔══════════════════════════════════╗
║     📱 *ℚℝ ℂ𝕆𝔻𝔼 𝕄𝔸𝕂𝔼ℝ* 📱       ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:* ${p}qr [text/link]
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}qr https://example.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate QR codes for any text or URL!`;
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;

    try {
        const displayText = text.length > 50 ? text.substring(0, 50) + "..." : text;

        return {
            image: { url: qrUrl },
            caption: `╔══════════════════════════════════╗
║   📱 *ℚℝ ℂ𝕆𝔻𝔼 𝔾𝔼ℕ𝔼ℝ𝔸𝕋𝔼𝔻* 📱     ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 *𝔻𝔸𝕋𝔸 𝔼ℕℂ𝕆𝔻𝔼𝔻*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${displayText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Scan with any QR reader app!_ 📷`
        };
    } catch (err) {
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to generate QR code.
Please try again later.`;
    }
};
