import { exec } from "child_process";
import { promisify } from "util";
import { getCachedConfig } from "../../services/configService.js";

const execPromise = promisify(exec);

export const update = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    try {
        await sock.sendMessage(m.key.remoteJid, {
            text: `╔══════════════════════════════════╗\n║   🔄 *𝕋𝔼ℝ𝕍𝕌X 𝕌ℙ𝔻𝔸𝕋𝔼* 🔄           ║\n╚══════════════════════════════════╝\n\n📡 *Status:* Fetching latest updates from repository...`
        }, { quoted: m });

        console.log(`📡 [${sock.sessionId}] Running git pull...`);
        const { stdout, stderr } = await execPromise("git pull");

        if (stdout.includes("Already up to date.")) {
            return `╔══════════════════════════════════╗\n║   ✅ *𝕌ℙ-𝕋𝕆-𝔻𝔸𝕋𝔼* ✅             ║\n╚══════════════════════════════════╝\n\n✨ The bot is already running the latest version.`;
        }

        const successMsg = `╔══════════════════════════════════╗\n║   🚀 *𝕌ℙ𝔻𝔸𝕋𝔼 𝕊𝕌ℂℂ𝔼𝕊𝕊𝔽𝕌𝕃* 🚀      ║\n╚══════════════════════════════════╝\n\n📦 *Update Logs:*\n\`\`\`${stdout}\`\`\`\n\n🔄 *Restarting bot to apply changes...*`;

        await sock.sendMessage(m.key.remoteJid, { text: successMsg }, { quoted: m });

        console.log(`🚀 Update complete. Restarting in 3 seconds...`);

        setTimeout(() => {
            process.exit(0);
        }, 3000);

        return null;

    } catch (err) {
        console.error("Update Command Error:", err.message);
        return `╔══════════════════════════════════╗\n║        ❌ *𝕌ℙ𝔻𝔸𝕋𝔼 𝔽𝔸𝕀𝕃𝔼𝔻* ❌       ║\n╚══════════════════════════════════╝\n\n⚠️ *Error:* ${err.message}\n\n💡 _Make sure the bot is running in a Git repository._`;
    }
};
