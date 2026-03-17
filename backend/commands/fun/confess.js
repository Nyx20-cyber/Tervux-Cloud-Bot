import { getCachedConfig } from "../../services/configService.js";

export const confess = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const confession = args.join(" ");
    const chatJid = m.key.remoteJid;

    if (!confession) {
        return `╔══════════════════════════════════╗
║   🤫 *𝔸ℕ𝕆ℕ ℂ𝕆ℕ𝔽𝔼𝕊𝕊* 🤫            ║
╚══════════════════════════════════╝

This command sends your confession anonymously in the current chat.

*Usage:* ${p}confess <your confession>

💡 Your confession will be sent
anonymously — no one will know
who sent it!

*Example:* ${p}confess I think pizza is overrated`;
    }

    // Delete the original command message to keep it anonymous
    try {
        await sock.sendMessage(chatJid, { delete: m.key });
    } catch (e) {
        // Can't delete in some cases, that's ok
    }

    // Send anonymous confession
    await sock.sendMessage(chatJid, {
        text: `╔══════════════════════════════════╗
║   🤫 *𝔸ℕ𝕆ℕ𝕐𝕄𝕆𝕌𝕊 ℂ𝕆ℕ𝔽𝔼𝕊𝕊𝕀𝕆ℕ* 🤫   ║
╚══════════════════════════════════╝

💭 *"${confession}"*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕵️ *From:* Anonymous
⏰ *Time:* ${new Date().toLocaleTimeString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Who could have sent this?_ 👀
_Use ${p}confess to send your own!_`
    });

    return null;
};
