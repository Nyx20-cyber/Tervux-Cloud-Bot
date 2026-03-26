import { launchBackgroundSequence, sleep } from "./background.js";

const hackSteps = [
    "🔓 Initializing hack sequence...",
    "📡 Connecting to target device...",
    "🌐 Bypassing firewall... [██░░░░░░░░] 20%",
    "🔑 Cracking password... [████░░░░░░] 40%",
    "📂 Accessing files... [██████░░░░] 60%",
    "💾 Downloading data... [████████░░] 80%",
    "🔒 Encrypting traces... [██████████] 100%",
];

export const hack = async (sock, m, args) => {
    const target = args[0] || "unknown";
    const chatJid = m.key.remoteJid;

    // Send initial message
    await sock.sendMessage(chatJid, {
        text: `╔══════════════════════════════════╗
║   💻 *ℍ𝔸ℂ𝕂𝔼ℝ 𝕄𝕆𝔻𝔼* 💻             ║
╚══════════════════════════════════╝

🎯 *Target:* ${target}
⏳ Starting hack sequence...`
    });

    launchBackgroundSequence(sock, "hack-sequence", async () => {
        for (const step of hackSteps) {
            await sleep(1500);
            await sock.sendMessage(chatJid, { text: step });
        }

        await sleep(2000);
        await sock.sendMessage(chatJid, {
            text: `╔══════════════════════════════════╗
║   ✅ *ℍ𝔸ℂ𝕂 ℂ𝕆𝕄ℙ𝕃𝔼𝕋𝔼* ✅           ║
╚══════════════════════════════════╝

📋 *Results for ${target}:*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 *Device:* iPhone 15 Pro Max
🔋 *Battery:* 69%
📍 *Location:* Behind you 👀
🔑 *Password:* ILoveTervuxBot
💬 *Last Search:* "How to be cool"
🎵 *Last Song:* Baby Shark 🦈
📸 *Gallery:* 847 selfies found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

😂 _Just kidding! This is a prank!_
🛡️ _No one was actually hacked._`
        });
    });

    return null;
};
