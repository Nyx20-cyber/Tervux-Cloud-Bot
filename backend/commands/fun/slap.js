import { getCachedConfig } from "../../services/configService.js";

export const slap = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    
    const sender = m.key.participant || m.key.remoteJid;
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentions[0] || quoted;

    if (!target) {
        return "❓ Who do you want to slap? Tag someone or reply to their message!";
    }

    if (target === sender) {
        return "🤨 Why would you slap yourself? Get some help!";
    }

    const slaps = [
        "gave a legendary backhand to",
        "slapped the soul out of",
        "hit a powerful 5-finger discount on",
        "gave a resounding SLAP to",
        "sent a virtual slap across the face of"
    ];

    const randomSlap = slaps[Math.floor(Math.random() * slaps.length)];

    return {
        text: `💥 *𝕊𝕃𝔸ℙ!* 💥\n\n@${sender.split("@")[0]} ${randomSlap} @${target.split("@")[0]}! 💀👟`,
        mentions: [sender, target]
    };
};
