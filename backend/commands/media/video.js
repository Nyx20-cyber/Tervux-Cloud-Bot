import yts from "yt-search";
import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";

export const video = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ");
    if (!query) {
        return `╔══════════════════════════════════╗
║   📹 *𝕋𝔼ℝ𝕍𝕌X 𝕍𝕀𝔻𝔼𝕆* 📹           ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:* ${p}video [video name]
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}video funny cats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Download videos instantly! 🎬`;
    }

    try {
        const search = await yts(query);
        const vid = search.videos[0];

        if (!vid) {
            return `╔══════════════════════════════════╗
|       ❌ * ℕ𝕆𝕋 𝔽𝕆𝕌ℕ𝔻 * ❌          |
╚══════════════════════════════════╝

Video not found.
Try a different search term.`;
        }

        const message = `╔══════════════════════════════════╗
║    📹 *𝕍𝕀𝔻𝔼𝕆 𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻* 📹        ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *𝕍𝕀𝔻𝔼𝕆 𝕀ℕ𝔽𝕆*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *𝕋𝕚𝕥𝕝𝕖:* ${vid.title}
⏱️ *𝔻𝕦𝕣𝕒𝕥𝕚𝕠𝕟:* ${vid.timestamp}
👀 *𝕍𝕚𝕖��𝕤:* ${vid.views}
🔗 *𝕃𝕚𝕟𝕜:* ${vid.url}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Downloading video... please wait._ ⏳`;

        // SAFE MEDIA DELIVERY
        let thumbBuffer;
        try {
            const res = await axios.get(vid.thumbnail, { responseType: 'arraybuffer', timeout: 5000 });
            thumbBuffer = Buffer.from(res.data);
        } catch (e) {
            console.warn("Video thumbnail download failed.");
        }

        const sentMsg = await sock.sendMessage(m.remoteJid || m.key.remoteJid, {
            ...(thumbBuffer ? { image: thumbBuffer } : { text: message }),
            ...(thumbBuffer ? { caption: message } : {}),
            linkPreview: null
        }, { quoted: m });


        // Try download with local yt-dlp
        try {
            const { downloadYT } = await import("../../utils/ytdl.js");
            const videoBuffer = await downloadYT(vid.url, 'video');

            if (!videoBuffer || videoBuffer.length < 5000) {
                throw new Error("Downloaded video file is invalid or empty.");
            }

            await sock.sendMessage(m.remoteJid || m.key.remoteJid, {
                video: videoBuffer,
                caption: vid.title,
                mimetype: 'video/mp4'
            }, { quoted: m });

        } catch (downloadErr) {
            console.error("Video download failed:", downloadErr.message);
            await sock.sendMessage(m.remoteJid || m.key.remoteJid, {
                text: `╔══════════════════════════════════╗
║        ❌ *𝔼ℝℝ𝕆ℝ* ❌             ║
╚══════════════════════════════════╝

⚠️ *Download failed:*
    ${downloadErr.message}

👇 Please watch using the link above.`
            }, { quoted: m });
        }

    } catch (err) {
        console.error("Video error:", err.message);
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to process video request.`;
    }
};
