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

export const block = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const target = resolveTarget(m, args);
    const ownJid = normalizeJid(sock.user?.id || "");

    if (!target) {
        return `╔══════════════════════════════════╗
║         ❓ *ℍ𝔼𝕃ℙ* ❓             ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Mention: *${p}block @user*
• Reply: Reply to a message with *${p}block*
• Number: *${p}block 1234567890*

Please mention, reply to a user, or provide a number!`;
    }

    if (target === ownJid) {
        return `╔══════════════════════════════════╗
║         ⚠️ *ℕ𝕆𝕋 𝔸𝕃𝕃𝕆𝕎𝔼𝔻* ⚠️      ║
╚══════════════════════════════════╝

You cannot block your own number.`;
    }

    try {
        await sock.updateBlockStatus(target, "block");
        return `╔══════════════════════════════════╗
║     🚫 *𝕌𝕊𝔼ℝ 𝔹𝕃𝕆ℂ𝕂𝔼𝔻* 🚫        ║
╚══════════════════════════════════╝

✅ *𝕊𝕦𝕔𝕔𝕖𝕤𝕤𝕗𝕦𝕝𝕝𝕪 𝕓𝕝𝕠𝕔𝕜𝕖𝕕!*

👤 *𝕌𝕤𝕖𝕣:* @${target.split("@")[0]}
🔒 *𝕊𝕥𝕒𝕥𝕦𝕤:* Blocked

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Use ${p}unblock to undo this action_`;
    } catch (error) {
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to block user.
${error?.message || "Please try again later."}`;
    }
};
