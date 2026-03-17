import { getCachedConfig } from "../../services/configService.js";

export const eightball = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const question = args.join(" ");

    if (!question) {
        return `╔══════════════════════════════════╗
║   🎱 *𝕄𝔸𝔾𝕀ℂ 𝟠-𝔹𝔸𝕃𝕃* 🎱           ║
╚══════════════════════════════════╝

❓ Ask me a yes/no question!

This command gives a random yes/no style answer to your question.

*Usage:* ${p}8ball Will I pass my exams?`;
    }

    const responses = [
        // Positive
        "🟢 It is certain!",
        "🟢 Without a doubt!",
        "🟢 Yes, definitely!",
        "🟢 You may rely on it!",
        "🟢 As I see it, yes!",
        "🟢 Most likely!",
        "🟢 Outlook good!",
        "🟢 Signs point to yes!",
        "🟢 Absolutely! 💯",
        // Neutral
        "🟡 Reply hazy, try again...",
        "🟡 Ask again later...",
        "🟡 Better not tell you now...",
        "🟡 Cannot predict now...",
        "🟡 Concentrate and ask again...",
        // Negative
        "🔴 Don't count on it.",
        "🔴 My reply is no.",
        "🔴 My sources say no.",
        "🔴 Outlook not so good.",
        "🔴 Very doubtful.",
        "🔴 Not a chance! 😬"
    ];

    const answer = responses[Math.floor(Math.random() * responses.length)];

    return `╔══════════════════════════════════╗
║   🎱 *𝕄𝔸𝔾𝕀ℂ 𝟠-𝔹𝔸𝕃𝕃* 🎱           ║
╚══════════════════════════════════╝

❓ *Question:* ${question}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔮 *Answer:* ${answer}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
};
