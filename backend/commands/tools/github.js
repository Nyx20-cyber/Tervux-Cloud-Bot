import { getCachedConfig } from "../../services/configService.js";
import axios from "axios";

export const github = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const username = args[0];

    if (!username) {
        return `╔══════════════════════════════════╗
║   🐙 *𝔾𝕀𝕋ℍ𝕌𝔹 𝕃𝕆𝕆𝕂𝕌ℙ* 🐙           ║
╚══════════════════════════════════╝

*Usage:* ${p}github <username>
*Example:* ${p}github torvalds`;
    }

    try {
        const { data } = await axios.get(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            { timeout: 10000 }
        );

        const chatJid = m.key.remoteJid;
        const created = new Date(data.created_at).toLocaleDateString();

        const caption = `╔══════════════════════════════════╗
║   🐙 *𝔾𝕀𝕋ℍ𝕌𝔹 ℙℝ𝕆𝔽𝕀𝕃𝔼* 🐙          ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *${data.name || data.login}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• 🏷️ *Username:* ${data.login}
${data.bio ? `• 📝 *Bio:* ${data.bio}\n` : ""}${data.company ? `• 🏢 *Company:* ${data.company}\n` : ""}${data.location ? `• 📍 *Location:* ${data.location}\n` : ""}${data.blog ? `• 🌐 *Website:* ${data.blog}\n` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Stats:*
• 📦 *Repos:* ${data.public_repos}
• 👥 *Followers:* ${data.followers}
• 👤 *Following:* ${data.following}
• 📅 *Joined:* ${created}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 *Profile:* github.com/${data.login}`;

        // Try to send with avatar
        if (data.avatar_url) {
            try {
                const imgRes = await axios.get(data.avatar_url, {
                    responseType: "arraybuffer",
                    timeout: 10000
                });
                await sock.sendMessage(chatJid, {
                    image: Buffer.from(imgRes.data),
                    caption
                }, { quoted: m });
                return null;
            } catch { /* Fall through to text */ }
        }

        return caption;
    } catch (err) {
        if (err.response?.status === 404) {
            return `╔══════════════════════════════════╗
║   🐙 *𝔾𝕀𝕋ℍ𝕌𝔹 𝕃𝕆𝕆𝕂𝕌ℙ* 🐙           ║
╚══════════════════════════════════╝

❌ User "*${username}*" not found on GitHub.
💡 _Check the spelling and try again._`;
        }
        return `❌ GitHub lookup failed: ${err.message}`;
    }
};
