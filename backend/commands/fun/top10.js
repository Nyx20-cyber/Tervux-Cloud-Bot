import { getCachedConfig } from "../../services/configService.js";

export const top10 = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) {
        return "❌ This rankings only work in groups!";
    }

    const trait = args.join(" ").trim() || "Toxic";
    
    try {
        const metadata = await sock.groupMetadata(remoteJid);
        const participants = metadata.participants;
        
        // Shuffle and pick 10
        const shuffled = participants.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 10);
        
        let response = `🏆 *𝕋𝕆ℙ 𝟙𝟘 ${trait.toUpperCase()} 𝕄𝔼𝕄𝔹𝔼ℝ𝕊* 🏆\n\n`;
        const mentions = [];

        selected.forEach((p, i) => {
            const jid = p.id;
            const percentage = Math.floor(Math.random() * 101);
            response += `${i + 1}. @${jid.split("@")[0]} — ${percentage}%\n`;
            mentions.push(jid);
        });

        response += `\n⚠️ *Disclaimer:* This is 100% accurate (according to my imaginary sensors).`;

        return { text: response, mentions };
    } catch (e) {
        console.error("Top10 error:", e);
        return "❌ Failed to fetch group members for the ranking.";
    }
};
