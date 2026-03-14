import { getCachedConfig } from "../../services/configService.js";

const getContextInfo = (m) => {
    const message = m?.message || {};
    for (const value of Object.values(message)) {
        if (value && typeof value === "object" && "contextInfo" in value) {
            return value.contextInfo || {};
        }
    }
    return {};
};

const normalizeJid = (value) => {
    if (!value) return null;
    if (value.endsWith("@g.us")) return null;
    if (value.includes("@")) {
        const user = value.split("@")[0].split(":")[0];
        return `${user}@s.whatsapp.net`;
    }

    const digits = value.replace(/[^0-9]/g, "");
    return digits ? `${digits}@s.whatsapp.net` : null;
};

const resolveTarget = (m, args) => {
    const contextInfo = getContextInfo(m);
    const mentioned = contextInfo?.mentionedJid?.[0];
    const quoted = contextInfo?.participant;
    const fromArgs = args?.[0];
    const directChatTarget = m?.key?.remoteJid?.endsWith("@g.us") ? null : m?.key?.remoteJid;

    return normalizeJid(mentioned || quoted || fromArgs || directChatTarget);
};

export const unblock = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const target = resolveTarget(m, args);

    if (!target) {
        return `╔══════════════════════════════════╗
║         ❓ *ℍ𝔼𝕃ℙ* ❓             ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Reply: Reply to a message with *${p}unblock*
• Number: *${p}unblock 1234567890*

Please reply to a user or provide a phone number!`;
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
${error?.message || "Please try again later."}`;
    }
};
