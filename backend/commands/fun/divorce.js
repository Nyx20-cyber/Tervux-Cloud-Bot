import { getGroupDrama } from "../../utils/dramaStore.js";

export const divorce = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) {
        return "❌ This drama only happens in groups!";
    }

    const sender = m.key.participant || m.key.remoteJid;
    const drama = getGroupDrama(remoteJid);
    const partner = drama[sender]?.partner;

    if (!partner) {
        return "🤨 You are single! You need to be married to get a divorce.";
    }

    // Clear relationship for both
    delete drama[sender].partner;
    delete drama[sender].marriageDate;
    
    if (drama[partner]) {
        delete drama[partner].partner;
        delete drama[partner].marriageDate;
    }

    return {
        text: `💔 *𝕋ℍ𝔼 𝔼ℕ𝔻 𝕆𝔽 𝔸ℕ 𝔼ℝ𝔸* 💔\n\n@${sender.split("@")[0]} has officially divorced @${partner.split("@")[0]}!\n\n🥀 The papers are signed, the ring is gone, and the drama is over. You are both single now!`,
        mentions: [sender, partner]
    };
};
