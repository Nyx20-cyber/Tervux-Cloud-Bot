import { getCachedConfig } from "../../services/configService.js";
import { launchBackgroundSequence, sleep } from "./background.js";

export const suicide = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) {
        return "❌ You can only leave a group from within the group!";
    }

    const sender = m.key.participant || m.key.remoteJid;
    
    // Last Will messages
    const wills = [
        "It's been real, but I can't stay in this drama anymore. Goodbye cruel world!",
        "Tell my coins I loved them. See you on the other side!",
        "I'm deleting my existence from this group. Farewell!",
        "Final words: You guys are all crazy! I'm out!"
    ];
    
    const randomWill = wills[Math.floor(Math.random() * wills.length)];

    const message = `💀 *𝕋ℍ𝔼 𝔽𝕀ℕ𝔸𝕃 𝔼𝕏𝕀𝕋* 💀\n\n@${sender.split("@")[0]} has decided to end it all.\n\n📜 *Last Will:* "${randomWill}"\n\n🏃‍♂️ *Status:* Leaving group in 3... 2... 1...`;

    await sock.sendMessage(remoteJid, { text: message, mentions: [sender] }, { quoted: m });

    launchBackgroundSequence(sock, "suicide-sequence", async () => {
        await sleep(3000);

        try {
            await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
        } catch (e) {
            await sock.sendMessage(remoteJid, {
                text: "⚠️ I tried to remove you dramatically, but I don't have the power! (Make me admin first, or you are too powerful to leave)."
            }, { quoted: m });
        }
    });
    
    return null;
};
