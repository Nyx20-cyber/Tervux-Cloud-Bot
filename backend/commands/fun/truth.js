import { getCachedConfig } from "../../services/configService.js";

export const truth = async (sock, m, args) => {
    const truths = [
        "Who is your secret crush in this group?",
        "What is the most illegal thing you have ever done?",
        "Have you ever cheated on a school test?",
        "What is your biggest fear?",
        "If you could date anyone here, who would it be?",
        "What is the last thing you searched on your browser?",
        "Have you ever lied to your best friend?",
        "What is your most annoying habit?",
        "Who do you dislike the most in this group?",
        "Have you ever cried while watching a movie?"
    ];

    const randomTruth = truths[Math.floor(Math.random() * truths.length)];

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    return `╔══════════════════════════════════╗
║    😇 *𝕋ℝ𝕌𝕋ℍ 𝕆ℝ 𝔻𝔸ℝ𝔼* 😇        ║
║        ━━ *𝕋ℝ𝕌𝕋ℍ* ━━              ║
╚══════════════════════════════════╝

🎯 *𝕐𝕆𝕌ℝ ℚ𝕌𝔼𝕊𝕋𝕀𝕆ℕ:*

❓ ${randomTruth}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *𝔹𝔼 ℍ𝕆ℕ𝔼𝕊𝕋!* No lying allowed!
🎲 Use *${p}dare* if you're too scared`;
};
