import { getCachedConfig } from "../../services/configService.js";

const stages = {
    approach: {
        title: "🎯 HOW TO APPROACH HER",
        tips: [
            "🔥 *Confidence is key* — Walk up with a smile. Don't overthink it. She can sense nervousness, so fake it till you make it.",
            "👋 *Start casual* — Don't declare your love on day 1. Say hi, make small talk, ask about something you notice about her (her style, what she's reading, etc).",
            "😎 *Be different* — Don't just say 'hey beautiful.' Stand out by being genuinely interested in what she has to say.",
            "🎯 *Find common ground* — Shared interests are the fastest way to build a connection. Music, hobbies, classes, mutual friends — use them.",
            "📱 *Get her contact naturally* — Don't force it. Say something like 'I'm really enjoying this convo, can we continue it later?'"
        ]
    },
    texting: {
        title: "📱 TEXTING GAME",
        tips: [
            "💬 *First text:* Reference something from your conversation. 'Hey, it's [name] — the guy who argued that pineapple belongs on pizza 😂'",
            "⏰ *Timing matters* — Don't text at 2am unless she's already texting you. Morning/evening texts feel intentional and thoughtful.",
            "🚫 *Don't double/triple text* — If she hasn't replied, wait it out. Desperation kills attraction.",
            "😂 *Use humor* — Make her laugh over text and she'll associate talking to you with feeling good.",
            "❓ *Ask questions* — 'What's your favorite way to spend a weekend?' > 'wyd' every time.",
            "🔥 *Voice notes > text* — Hearing your voice makes the connection personal. She'll feel closer to you."
        ]
    },
    dating: {
        title: "💑 GETTING CLOSER",
        tips: [
            "🌹 *Plan actual dates* — Don't just say 'we should hang out sometime.' Pick a day, time, and plan.",
            "👂 *Listen actively* — Remember things she mentions and bring them up later. She'll feel seen and valued.",
            "💪 *Be consistent* — Don't be hot one day and cold the next. Stability builds trust.",
            "🎁 *Small gestures matter* — You don't need expensive gifts. A saved meme that reminded you of her, her favorite snack, remembering her exam dates — these things are gold.",
            "🚫 *Don't play games* — If you like her, let her know. Mixed signals waste everyone's time.",
            "👑 *Respect her boundaries* — If she says no or needs space, respect it. That builds more attraction than any pickup line."
        ]
    },
    confession: {
        title: "💗 TELLING HER HOW YOU FEEL",
        tips: [
            "🎯 *Pick the right moment* — Not in public, not when she's stressed. A calm, private moment works best.",
            "💯 *Be honest and direct* — 'I really like you, and I've been feeling this for a while. I'd love to take you out properly.'",
            "😌 *Don't pressure her* — After you confess, give her space to think. Don't demand an answer immediately.",
            "🛡️ *Be prepared for any response* — She might say yes, she might say she needs time, or she might not feel the same. All valid.",
            "💪 *No matter what happens, be proud* — It takes real courage to be vulnerable. That alone makes you a king.",
            "❤️ *If she says yes* — Don't change who you are. The person who attracted her is the real you."
        ]
    }
};

export const crush = async (sock, m, args) => {
    const stage = args[0]?.toLowerCase();
    const validStages = Object.keys(stages);

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!stage || !validStages.includes(stage)) {
        return `╔══════════════════════════════════╗
║   💘 *ℂℝ𝕌𝕊ℍ 𝔾𝕌𝕀𝔻𝔼* 💘              ║
╚══════════════════════════════════╝

Choose your stage, king 👑

🎯 *${p}crush approach*
_How to approach her & make a first impression_

📱 *${p}crush texting*
_Master the art of texting her_

💑 *${p}crush dating*
_How to get closer & build connection_

💗 *${p}crush confession*
_How to tell her how you feel_

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Real talk. No BS. Just what works._ 💯`;
    }

    const s = stages[stage];
    const tipsText = s.tips.map((tip, i) => `${i + 1}. ${tip}`).join("\n\n");

    return `╔══════════════════════════════════╗
║   💘 *ℂℝ𝕌𝕊ℍ 𝔾𝕌𝕀𝔻𝔼* 💘              ║
╚══════════════════════════════════╝

━━━ *${s.title}* ━━━

${tipsText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 *Other stages:*
${validStages.filter(v => v !== stage).map(v => `• *${p}crush ${v}*`).join("\n")}

_You got this, king_ 👑💪`;
};
