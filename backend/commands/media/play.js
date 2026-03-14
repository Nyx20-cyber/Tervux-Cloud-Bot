import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";
import {
    downloadRemoteBuffer,
    extractYouTubeId,
    fetchRapidYoutubeMedia,
    selectBestAudioFormat
} from "../../services/externalMediaService.js";

export const play = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `╔══════════════════════════════════╗
║    🎵 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕄𝕌𝕊𝕀ℂ* 🎵           ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:* ${p}play [YouTube link or ID]
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}play https://youtu.be/K4DyBUG242c

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Paste a YouTube link or video ID. 🎧`;
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
        const bestAudio = selectBestAudioFormat(media.results || []);

        const message = `╔══════════════════════════════════╗
║      🎵 *ℙ𝕃𝔸𝕐𝕀ℕ𝔾 𝕄𝕌𝕊𝕀ℂ* 🎵        ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *𝕋ℝ𝔸ℂ𝕂 𝕀ℕ𝔽𝕆*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *𝕋𝕚𝕥𝕝𝕖:* ${media.title}
🆔 *𝕍𝕚𝕕𝕖𝕠 𝕀𝔻:* ${videoId}
🔗 *𝕃𝕚𝕟𝕜:* https://youtu.be/${videoId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Downloading audio... please wait._ ⏳`;

        let thumbnailBuffer;
        try {
            const thumbRes = await axios.get(media.thumbnail, { responseType: "arraybuffer", timeout: 5000 });
            thumbnailBuffer = Buffer.from(thumbRes.data);
        } catch {
            console.warn("Failed to download thumbnail, proceeding without it.");
        }

        await sock.sendMessage(m.key.remoteJid, {
            ...(thumbnailBuffer ? { image: thumbnailBuffer } : { text: message }),
            ...(thumbnailBuffer ? { caption: message } : {}),
            linkPreview: null
        }, { quoted: m });

        if (!bestAudio?.url) {
            await sock.sendMessage(m.key.remoteJid, {
                text: `╔══════════════════════════════════╗
║      ℹ️ *𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻 ℕ𝕆𝕋𝕀ℂ𝔼* ℹ️      ║
╚══════════════════════════════════╝

We were unable to download the audio for your request at the moment.

This usually happens when the source is temporarily unavailable, restricted, or not returning a direct audio stream.

Please try again later using the same YouTube link or another video.

To use this command correctly, send:
• *${p}play https://youtu.be/${videoId}*
• *${p}play ${videoId}*

🔗 https://youtu.be/${videoId}`
            }, { quoted: m });
            return;
        }

        const audioBuffer = await downloadRemoteBuffer(bestAudio.url);
        if (!audioBuffer || audioBuffer.length < 1000) {
            throw new Error("Downloaded audio file is invalid or empty.");
        }

        await sock.sendMessage(m.key.remoteJid, {
            audio: audioBuffer,
            mimetype: "audio/mp4",
            fileName: `${media.title}.mp3`,
            ptt: false
        }, { quoted: m });
    } catch (err) {
        console.error("Play error:", err.message);
        return `╔══════════════════════════════════╗
║      ℹ️ *𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻 ℕ𝕆𝕋𝕀ℂ𝔼* ℹ️      ║
╚══════════════════════════════════╝

We had trouble downloading the audio for your request.

This can happen when the video source is busy, temporarily restricted, or not responding with a downloadable audio file.

Please try again later with the same YouTube link or choose a different video.

Use one of these formats next time:
• *${p}play https://youtu.be/${videoId}*
• *${p}play ${videoId}*

Details: ${err.message || "Audio download could not be completed."}`;
    }
};
