import { getCachedConfig } from "../../services/configService.js";

export const unblock = async (sock, m, args) => {
    let target = args[0] ? args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null;

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!target) {
        return `╔══════════════════════════════════╗
║         ❓ *ℍ𝔼𝕃ℙ* ❓             ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*${p}unblock 1234567890*

Please provide a phone number!`;
    }

    try {
        await sock.updateBlockStatus(target, "unblock");
        return `╔══════════════════════════════════╗
║    ✅ *𝕌𝕊𝔼ℝ 𝕌ℕ𝔹𝕃𝕆ℂ𝕂𝔼𝔻* ✅       ║
╚══════════════════════════════════╝

✅ *𝕊𝕦𝕔𝕔𝕖𝕤𝕤𝕗𝕦𝕝𝕝𝕪 𝕦𝕟𝕓𝕝𝕠𝕔𝕜𝕖𝕕!*

👤 *𝕌𝕤𝕖𝕣:* @${target.split("@")[0]}
🔓 *𝕊𝕥𝕒𝕥𝕦𝕤:* Unblocked

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_They can now message you again_`;
    } catch (error) {
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to unblock user.
Please try again later.`;
    }
};
