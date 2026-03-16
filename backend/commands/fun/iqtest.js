import { getCachedConfig } from "../../services/configService.js";

export const iqtest = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    
    const sender = m.key.participant || m.key.remoteJid;
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentions[0] || quoted || sender;
    
    const iq = Math.floor(Math.random() * 201);
    const targetName = target === sender ? "Your" : `@${target.split("@")[0]}'s`;
    
    let comment = "";
    if (iq < 50) {
        comment = "🤡 Honestly, I'm surprised you managed to send this command.";
    } else if (iq < 80) {
        comment = "🥴 You probably try to open 'Push' doors by pulling.";
    } else if (iq < 110) {
        comment = "😐 Perfectly average. You are the human version of plain white bread.";
    } else if (iq < 130) {
        comment = "🤓 Pretty smart! You probably know where the library is.";
    } else if (iq < 160) {
        comment = "🌟 Genius level! Are you planning to take over the world?";
    } else {
        comment = "🧠 UNREAL! Your brain is basically a supercomputer. Please don't replace me.";
    }

    return {
        text: `🧠 *𝕀ℚ 𝕋𝔼𝕊𝕋 ℝ𝔼𝕊𝕌𝕃𝕋* 🧠\n\n👤 *User:* @${target.split("@")[0]}\n📊 *IQ Score:* ${iq}\n\n✨ *Comment:* ${comment}`,
        mentions: [target]
    };
};
