import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";
import {
    downloadRemoteBuffer,
    extractYouTubeId,
    fetchRapidYoutubeMedia,
    selectBestVideoFormat
} from "../../services/externalMediaService.js";

export const video = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `╔══════════════════════════════════╗
║   📹 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕍𝕀𝔻𝔼𝕆* 📹           ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:* ${p}video [YouTube link or ID]
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}video https://youtu.be/K4DyBUG242c

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Paste a YouTube link or video ID. 🎬`;
    }

    const videoId = extractYouTubeId(input);
    if (!videoId) {
        return `╔══════════════════════════════════╗
║       ⚠️ *𝕀ℕℙ𝕌𝕋 ℕ𝔼𝔼𝔻𝔼𝔻* ⚠️        ║
╚══════════════════════════════════╝

Please send a valid YouTube link or 11-character video ID.

• Example link: *https://youtu.be/K4DyBUG242c*
• Example ID: *K4DyBUG242c*`;
    }

    try {
        const media = await fetchRapidYoutubeMedia(videoId);
        const bestVideo = selectBestVideoFormat(media.results || []);

        const message = `╔══════════════════════════════════╗
║    📹 *𝕍𝕀𝔻𝔼𝕆 𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻* 📹        ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *𝕍𝕀𝔻𝔼𝕆 𝕀ℕ𝔽𝕆*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *𝕋𝕚𝕥𝕝𝕖:* ${media.title}
🆔 *𝕍𝕚𝕕𝕖𝕠 𝕀𝔻:* ${videoId}
🎞️ *ℚ𝕦𝕒𝕝𝕚𝕥𝕪:* ${bestVideo?.quality || "Unknown"}
🔗 *𝕃𝕚𝕟𝕜:* https://youtu.be/${videoId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Downloading video... please wait._ ⏳`;

        let thumbBuffer;
        try {
            const res = await axios.get(media.thumbnail, { responseType: "arraybuffer", timeout: 5000 });
            thumbBuffer = Buffer.from(res.data);
        } catch {
            console.warn("Video thumbnail download failed.");
        }

        await sock.sendMessage(m.key.remoteJid, {
            ...(thumbBuffer ? { image: thumbBuffer } : { text: message }),
            ...(thumbBuffer ? { caption: message } : {}),
            linkPreview: null
        }, { quoted: m });

        if (!bestVideo?.url || /manifest|\.m3u8($|\?)/i.test(bestVideo.url)) {
            await sock.sendMessage(m.key.remoteJid, {
                text: `╔══════════════════════════════════╗
║      ℹ️ *𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻 ℕ𝕆𝕋𝕀ℂ𝔼* ℹ️      ║
╚══════════════════════════════════╝

We were unable to download the video for your request at the moment.

This usually happens when the source is temporarily unavailable, restricted, or not returning a direct downloadable MP4 file.

Please try again later using the same YouTube link or another video.

To use this command correctly, send:
• *${p}video https://youtu.be/${videoId}*
• *${p}video ${videoId}*

🔗 https://youtu.be/${videoId}`
            }, { quoted: m });
            return;
        }

        const videoBuffer = await downloadRemoteBuffer(bestVideo.url);
        if (!videoBuffer || videoBuffer.length < 5000) {
            throw new Error("Downloaded video file is invalid or empty.");
        }

        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: `${media.title}${bestVideo.has_audio ? "" : "\n\n⚠️ Note: This video format may not include audio."}`,
            mimetype: "video/mp4"
        }, { quoted: m });
    } catch (err) {
        console.error("Video error:", err.message);
        return `╔══════════════════════════════════╗
║      ℹ️ *𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻 ℕ𝕆𝕋𝕀ℂ𝔼* ℹ️      ║
╚══════════════════════════════════╝

We had trouble downloading the video for your request.

This can happen when the video source is busy, temporarily restricted, or not responding with a downloadable video file.

Please try again later with the same YouTube link or choose a different video.

Use one of these formats next time:
• *${p}video https://youtu.be/${videoId}*
• *${p}video ${videoId}*

Details: ${err.message || "Video download could not be completed."}`;
    }
};
