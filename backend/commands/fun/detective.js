import { launchBackgroundSequence, sleep } from "./background.js";

const fakeLocations = [
    "Bathroom, scrolling TikTok 🚽📱",
    "Kitchen, eating leftovers at 3am 🍕",
    "In bed pretending to be busy 🛏️",
    "At the store buying more data bundles 📶",
    "In class, not paying attention 📚",
    "Gym... just kidding, on the couch 🛋️",
    "Hiding from responsibilities 🏃",
    "At work, scrolling WhatsApp 💼📱",
    "Behind you. Don't look 👀",
    "In the metaverse 🥽"
];

const fakeSearches = [
    "How to look cool on WhatsApp",
    "Why is my crush not replying",
    "Free WiFi hack 2024",
    "How to be popular",
    "Am I being spied on right now",
    "Best excuses for not replying",
    "How to pretend you're busy",
    "Signs someone likes you",
    "Why am I like this",
    "Free V-Bucks generator"
];

const fakeSecrets = [
    "Secretly watches anime at 3am 🌙",
    "Has 47 unread messages from mom 📩",
    "Screen time: 14 hours/day 📱",
    "Talks to themselves in the mirror 🪞",
    "Still uses Internet Explorer 💀",
    "Types 'haha' but never actually laughs 😐",
    "Has 200+ screenshots of memes saved 📸",
    "Googles song lyrics instead of learning them 🎵",
    "Sets 15 alarms and still wakes up late ⏰",
    "Reads messages and forgets to reply for 3 days 💬"
];

export const detective = async (sock, m, args) => {
    const chatJid = m.key.remoteJid;
    const target = args[0] || "suspect";

    await sock.sendMessage(chatJid, {
        text: `╔══════════════════════════════════╗
║  🔍 *𝔻𝔼𝕋𝔼ℂ𝕋𝕀𝕍𝔼 𝕄𝕆𝔻𝔼* 🔍          ║
╚══════════════════════════════════╝

🎯 *Target:* ${target}
🕵️ Beginning investigation...`
    });

    const steps = [
        "🔍 Scanning WhatsApp activity...",
        "📊 Analyzing message patterns...",
        "📱 Accessing device metadata...",
        "🌐 Tracing IP address...",
        "📂 Compiling investigation report..."
    ];

    launchBackgroundSequence(sock, "detective-sequence", async () => {
        for (const step of steps) {
            await sleep(1200);
            await sock.sendMessage(chatJid, { text: step });
        }

        const location = fakeLocations[Math.floor(Math.random() * fakeLocations.length)];
        const search = fakeSearches[Math.floor(Math.random() * fakeSearches.length)];
        const secret = fakeSecrets[Math.floor(Math.random() * fakeSecrets.length)];
        const iq = Math.floor(Math.random() * 60) + 40;
        const crush = Math.floor(Math.random() * 100);
        const chill = Math.floor(Math.random() * 100);

        await sleep(1500);

        await sock.sendMessage(chatJid, {
            text: `╔══════════════════════════════════╗
║  📋 *𝕀ℕ𝕍𝔼𝕊𝕋𝕀𝔾𝔸𝕋𝕀𝕆ℕ ℝ𝔼ℙ𝕆ℝ𝕋* 📋    ║
╚══════════════════════════════════╝

🎯 *Subject:* ${target}
🔒 *Classification:* TOP SECRET

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 *Current Location:*
${location}

🔍 *Last Search:*
"${search}"

🤫 *Dirty Secret:*
${secret}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Analysis:*
• 🧠 IQ Level: ${iq}%
• 💘 Crush Factor: ${crush}%
• 😎 Chill Meter: ${chill}%
• 🤡 Clown Level: ${100 - chill}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Verdict:* ${iq > 70 ? "Suspicious but smart 🧐" : "Definitely sus 🤨"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
😂 _This is a prank! No actual_
_investigation was conducted._ 🎭`
        });
    });

    return null;
};
