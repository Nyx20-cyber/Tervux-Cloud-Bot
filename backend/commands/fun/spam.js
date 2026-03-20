import { launchBackgroundSequence, sleep } from "./background.js";

const emojiSets = [
    "💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀",
    "😂🤣😂🤣😂🤣😂🤣😂🤣😂🤣😂🤣😂",
    "🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥",
    "❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️",
    "🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡🤡",
    "👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻",
    "💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩",
    "🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒🐒",
    "✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨",
    "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
];

export const spam = async (sock, m, args) => {
    const chatJid = m.key.remoteJid;

    await sock.sendMessage(chatJid, {
        text: `╔══════════════════════════════════╗
║  💣 *𝔼𝕄𝕆𝕁𝕀 𝔹𝕆𝕄𝔹* 💣               ║
╚══════════════════════════════════╝

💥 *INCOMING!* 💥`
    });

    const waves = 5;
    launchBackgroundSequence(sock, "spam-sequence", async () => {
        for (let i = 0; i < waves; i++) {
            await sleep(500);
            const set = emojiSets[Math.floor(Math.random() * emojiSets.length)];
            await sock.sendMessage(chatJid, {
                text: `${set}\n${set}\n${set}`
            });
        }

        await sleep(800);

        await sock.sendMessage(chatJid, {
            text: `╔══════════════════════════════════╗
║  ✅ *𝔹𝕆𝕄𝔹 ℂ𝕆𝕄ℙ𝕃𝔼𝕋𝔼* ✅            ║
╚══════════════════════════════════╝

💥 ${waves} emoji waves delivered!
😂 _Your chat is now blessed_ ✨`
        });
    });

    return null;
};
