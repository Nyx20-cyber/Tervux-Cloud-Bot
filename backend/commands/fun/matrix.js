import { launchBackgroundSequence, sleep } from "./background.js";

const matrixChars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789".split("");

function generateMatrixLine(width = 30) {
    return Array.from({ length: width }, () =>
        matrixChars[Math.floor(Math.random() * matrixChars.length)]
    ).join("");
}

export const matrix = async (sock, m, args) => {
    const chatJid = m.key.remoteJid;

    await sock.sendMessage(chatJid, {
        text: `╔══════════════════════════════════╗
║  🟢 *𝕄𝔸𝕋ℝ𝕀𝕏 𝕄𝕆𝔻𝔼* 🟢              ║
╚══════════════════════════════════╝

_Entering the Matrix..._
_Wake up, Neo..._`
    });

    launchBackgroundSequence(sock, "matrix-sequence", async () => {
        await sleep(1500);

        for (let i = 0; i < 4; i++) {
            const lines = [];
            for (let j = 0; j < 6; j++) {
                lines.push(generateMatrixLine(28));
            }
            await sock.sendMessage(chatJid, {
                text: `\`\`\`\n${lines.join("\n")}\n\`\`\``
            });
            await sleep(800);
        }

        await sleep(1000);

        const secretMessages = [
            "The Matrix has you...",
            "Follow the white rabbit 🐇",
            "There is no spoon 🥄",
            "Free your mind 🧠",
            "I know kung fu 🥋",
            "Red pill or blue pill? 💊",
            "The One has arrived ⚡"
        ];

        const msg = secretMessages[Math.floor(Math.random() * secretMessages.length)];

        await sock.sendMessage(chatJid, {
            text: `╔══════════════════════════════════╗
║  🟢 *𝕄𝔸𝕋ℝ𝕀𝕏 𝔻𝔼ℂ𝕆𝔻𝔼𝔻* 🟢           ║
╚══════════════════════════════════╝

🔓 *Hidden Message Found:*

> _"${msg}"_

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_You've been unplugged_ 🔌
_Welcome to the real world_ 🌍`
        });
    });

    return null;
};
