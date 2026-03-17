import { getGroupDrama } from "../../utils/dramaStore.js";
import { getCachedConfig } from "../../services/configService.js";

export const accept = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    if (!remoteJid.endsWith("@g.us")) {
        return "❌ This drama only happens in groups!";
    }

    const sender = m.key.participant || m.key.remoteJid;
    const drama = getGroupDrama(remoteJid);

    // Check if sender has a proposal
    const proposer = drama[sender]?.proposal;

    if (!proposer) {
        return `🤨 No one has proposed to you lately. Try using *${p}marry* on someone yourself!`;
    }

    // Check if proposer is already married (edge case)
    if (drama[proposer]?.partner) {
        delete drama[sender].proposal;
        return `💔 Oops! @${proposer.split("@")[0]} already married someone else while you were thinking!`;
    }

    // Finalize marriage
    const marriageDate = new Date();
    
    if (!drama[sender]) drama[sender] = {};
    drama[sender].partner = proposer;
    drama[sender].marriageDate = marriageDate;
    delete drama[sender].proposal;

    if (!drama[proposer]) drama[proposer] = {};
    drama[proposer].partner = sender;
    drama[proposer].marriageDate = marriageDate;

    return {
        text: `🎉 *ℍ𝔸ℙℙ𝕀𝕃𝕐 𝔼𝕍𝔼ℝ 𝔸𝔽𝕋𝔼ℝ* 🎉\n\nCongratulations! @${sender.split("@")[0]} and @${proposer.split("@")[0]} are now officially married! 💍\n\n📅 *Date:* ${marriageDate.toDateString()}\n\n🎊 Wishing the new couple a life full of drama and fun!`,
        mentions: [sender, proposer]
    };
};
