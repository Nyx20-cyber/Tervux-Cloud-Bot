import { getGroupDrama } from "../../utils/dramaStore.js";
import { getCachedConfig } from "../../services/configService.js";

export const marry = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    if (!remoteJid.endsWith("@g.us")) {
        return "❌ This drama only happens in groups!";
    }

    const sender = m.key.participant || m.key.remoteJid;
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentions[0] || quoted;

    if (!target) {
        return "❓ Who do you want to marry? Tag them or reply to their message!";
    }

    if (target === sender) {
        return "🤨 You can't marry yourself! That's just weird.";
    }

    const drama = getGroupDrama(remoteJid);

    // Check if sender is already married
    if (drama[sender]?.partner) {
        return `🚫 You are already married to @${drama[sender].partner.split("@")[0]}! Divorce them first!`;
    }

    // Check if target is already married
    if (drama[target]?.partner) {
        return `💔 @${target.split("@")[0]} is already married to @${drama[target].partner.split("@")[0]}! Too late!`;
    }

    // Set proposal
    if (!drama[target]) drama[target] = {};
    drama[target].proposal = sender;

    return {
        text: `💍 *𝕄𝔸ℝℝ𝕀𝔸𝔾𝔼 ℙℝ𝕆ℙ𝕆𝕊𝔸𝕃* 💍\n\n@${sender.split("@")[0]} has proposed to @${target.split("@")[0]}!\n\n✨ @${target.split("@")[0]}, do you accept? Reply with *${p}accept* to make it official!`,
        mentions: [sender, target]
    };
};
