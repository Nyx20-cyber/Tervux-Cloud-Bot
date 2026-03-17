import { getCachedConfig } from "../../services/configService.js";

function hashNames(name1, name2) {
    const combined = (name1 + name2).toLowerCase().replace(/\s/g, "");
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

const verdicts = [
    { min: 90, emoji: "💍", title: "SOULMATES!", desc: "This is a match made in heaven! You two are literally destined for each other. Wedding bells are ringing! 🔔" },
    { min: 80, emoji: "❤️‍🔥", title: "ON FIRE!", desc: "Insane chemistry! You two together would be GOALS. The spark is real and everyone can see it! ✨" },
    { min: 70, emoji: "💕", title: "STRONG MATCH!", desc: "You two have great potential! With a little effort, this could turn into something truly beautiful. 🌹" },
    { min: 60, emoji: "💛", title: "GOOD VIBES!", desc: "There's definitely something there! Keep building that connection and watch it grow. 🌱" },
    { min: 50, emoji: "🤔", title: "INTERESTING...", desc: "It's not a perfect match, but the best love stories start with unexpected beginnings. Give it a shot! 🎲" },
    { min: 40, emoji: "😅", title: "WORK IN PROGRESS", desc: "You'll need to put in some effort, but hey — some of the strongest couples started from zero! 💪" },
    { min: 30, emoji: "🤷", title: "TRICKY ONE", desc: "It might take some work. But if the feelings are real, nothing is impossible. Stay patient. 🙏" },
    { min: 0, emoji: "💔", title: "TOUGH ODDS", desc: "The stars aren't perfectly aligned right now... but love has a way of defying odds. Never give up! 🌟" }
];

export const compatibility = async (sock, m, args) => {
    const input = args.join(" ");

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!input || !input.includes("&") && !input.includes("+") && !input.includes("and")) {
        return `╔══════════════════════════════════╗
║   💞 *ℂ𝕆𝕄ℙ𝔸𝕋𝕀𝔹𝕀𝕃𝕀𝕋𝕐* 💞            ║
╚══════════════════════════════════╝

This command checks a fun love compatibility score between two names.

*Usage:* ${p}compatibility <name1> & <name2>

*Examples:*
• *${p}compatibility Romeo & Juliet*
• *${p}compatibility Me + Her*
• *${p}compatibility John and Jane*`;
    }

    // Split by & or + or "and"
    const parts = input.split(/\s*[&+]\s*|\s+and\s+/i);
    const name1 = parts[0]?.trim() || "Person 1";
    const name2 = parts[1]?.trim() || "Person 2";

    // Generate consistent score for same name pair
    const hash = hashNames(name1, name2);
    const score = (hash % 61) + 40; // Range: 40-100 (always hopeful)

    const verdict = verdicts.find(v => score >= v.min);

    const hearts = "❤️".repeat(Math.ceil(score / 10));

    return `╔══════════════════════════════════╗
║   💞 *𝕃𝕆𝕍𝔼 ℂ𝕆𝕄ℙ𝔸𝕋𝕀𝔹𝕀𝕃𝕀𝕋𝕐* 💞      ║
╚══════════════════════════════════╝

👤 *${name1}*
        💘
👤 *${name2}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💯 *Love Score:* ${score}%

${hearts}

${verdict.emoji} *${verdict.title}*
${verdict.desc}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Test with different names!_ 🔄`;
};
