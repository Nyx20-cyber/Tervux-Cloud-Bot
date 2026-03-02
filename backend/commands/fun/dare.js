import { getCachedConfig } from "../../services/configService.js";

export const dare = async (sock, m, args) => {
    const dares = [
        "Send a message to your crush right now and show the screenshot.",
        "Change your WhatsApp profile picture to a potato for 1 hour.",
        "Voice record yourself singing a nursery rhyme and send it here.",
        "Ask a random person in the group for a 'virtual date'.",
        "Send the last 3 photos from your gallery.",
        "Text your mom 'I'm getting married' and show the reaction.",
        "Do 20 push-ups and record the sound of you breathing heavily (lol).",
        "Type your name using only your nose.",
        "Call a random contact and sing 'Happy Birthday' to them.",
        "Tell the group your most embarrassing secret."
    ];

    const randomDare = dares[Math.floor(Math.random() * dares.length)];

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    return `╔══════════════════════════════════╗
║    😈 *𝕋ℝ𝕌𝕋ℍ 𝕆ℝ 𝔻𝔸ℝ𝔼* 😈        ║
║        ━━ *𝔻𝔸ℝ𝔼* ━━               ║
╚══════════════════════════════════╝

🔥 *𝕐𝕆𝕌ℝ ℂℍ𝔸𝕃𝕃𝔼ℕ𝔾𝔼:*

⚡ ${randomDare}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💪 *ℕ𝕆 𝔼𝕏ℂ𝕌𝕊𝔼𝕊!* Complete the dare!
🐔 Use *${p}truth* if you're a chicken`;
};
