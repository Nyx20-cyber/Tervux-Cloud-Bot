import { getCachedConfig } from "../../services/configService.js";

const choices = ["rock", "paper", "scissors"];
const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };

function getResult(player, bot) {
    if (player === bot) return "draw";
    if (
        (player === "rock" && bot === "scissors") ||
        (player === "paper" && bot === "rock") ||
        (player === "scissors" && bot === "paper")
    ) return "win";
    return "lose";
}

export const rps = async (sock, m, args) => {
    const input = args[0]?.toLowerCase();

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!input || !choices.includes(input)) {
        return `╔══════════════════════════════════╗
║   ✊ *ℝ𝕆ℂ𝕂 ℙ𝔸ℙ𝔼ℝ 𝕊ℂ𝕀𝕊𝕊𝕆ℝ𝕊* ✊    ║
╚══════════════════════════════════╝

This command lets you play Rock Paper Scissors against the bot.

*Usage:* ${p}rps <choice>

🪨 *${p}rps rock*
📄 *${p}rps paper*
✂️ *${p}rps scissors*`;
    }

    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    const result = getResult(input, botChoice);

    const resultText = {
        win: "🏆 *YOU WIN!* 🎉",
        lose: "💀 *YOU LOSE!* 😅",
        draw: "🤝 *IT'S A DRAW!*"
    };

    return `╔══════════════════════════════════╗
║   ✊ *ℝ𝕆ℂ𝕂 ℙ𝔸ℙ𝔼ℝ 𝕊ℂ𝕀𝕊𝕊𝕆ℝ𝕊* ✊    ║
╚══════════════════════════════════╝

👤 *You:* ${emojis[input]} ${input}
🤖 *Bot:* ${emojis[botChoice]} ${botChoice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${resultText[result]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Play again! Best of 3?_ 🔄`;
};
