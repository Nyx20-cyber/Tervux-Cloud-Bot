import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { play } from "./play.js";
import { video } from "./video.js";
import { convert } from "./convert.js";
import { botstats } from "../general/botstats.js";
import { truth } from "../fun/truth.js";
import { dare } from "../fun/dare.js";
import { getCachedConfig } from "../../services/configService.js";
import { AUDD_API_TOKEN } from "../../env.js";

const execPromise = promisify(exec);

function getQuotedMessage(m) {
    return m.message?.extendedTextMessage?.contextInfo?.quotedMessage
        || m.message?.imageMessage?.contextInfo?.quotedMessage
        || m.message?.videoMessage?.contextInfo?.quotedMessage
        || null;
}

async function downloadQuotedBuffer(sock, quoted) {
    return downloadMediaMessage(
        { message: quoted },
        "buffer",
        {},
        { reuploadRequest: sock.updateMediaMessage }
    );
}

export const song = async (sock, m, args) => play(sock, m, args);
export const song2 = async (sock, m, args) => play(sock, m, args);
export const botstatus = async (sock, m, args) => botstats(sock, m, args);

export const tomp3 = async (sock, m) => convert(sock, m, ["tomp3"]);
export const toaudio = async (sock, m) => convert(sock, m, ["toaudio"]);

export const tovideo = async (sock, m, args) => {
    const quoted = getQuotedMessage(m);

    if (!quoted && args.length) {
        return video(sock, m, args);
    }

    if (!quoted) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║      🎬 *𝕋𝕆 𝕍𝕀𝔻𝔼𝕆* 🎬            ║
╚══════════════════════════════════╝

Reply to an image/sticker or send a YouTube link.

• *${p}tovideo* _(reply to image/sticker)_
• *${p}tovideo https://youtu.be/K4DyBUG242c*`;
    }

    const isImage = !!quoted.imageMessage;
    const isSticker = !!quoted.stickerMessage;
    const isVideo = !!quoted.videoMessage;

    if (isVideo) {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        await sock.sendMessage(m.key.remoteJid, {
            video: buffer,
            mimetype: "video/mp4",
            caption: "🎬 *Video ready.*"
        }, { quoted: m });
        return null;
    }

    if (!isImage && !isSticker) {
        return `⚠️ Reply to an image, sticker, or video, or provide a YouTube link.`;
    }

    const tempId = Date.now();
    const inputPath = path.join("/tmp", `tovideo_${tempId}_in`);
    const outputPath = path.join("/tmp", `tovideo_${tempId}_out.mp4`);

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        fs.writeFileSync(inputPath, buffer);

        await execPromise(`ffmpeg -y -loop 1 -i ${inputPath} -t 5 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -pix_fmt yuv420p ${outputPath}`);

        const outBuffer = fs.readFileSync(outputPath);
        await sock.sendMessage(m.key.remoteJid, {
            video: outBuffer,
            mimetype: "video/mp4",
            caption: "🎬 *Converted to video successfully.*"
        }, { quoted: m });

        return null;
    } catch (error) {
        console.error("tovideo error:", error.message);
        return `❌ Failed to convert to video: ${error.message}`;
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
};

export const volvideo = async (sock, m, args) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.videoMessage) {
        return `Reply to a video with *${p}volvideo 150* to boost volume.`;
    }

    const volumePercent = Number.parseInt(args[0] || "150", 10);
    const volumeMultiplier = Math.max(10, Math.min(500, volumePercent)) / 100;
    const tempId = Date.now();
    const inputPath = path.join("/tmp", `volvideo_${tempId}_in.mp4`);
    const outputPath = path.join("/tmp", `volvideo_${tempId}_out.mp4`);

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        fs.writeFileSync(inputPath, buffer);

        await execPromise(`ffmpeg -y -i ${inputPath} -vcodec copy -af "volume=${volumeMultiplier}" ${outputPath}`);

        const outBuffer = fs.readFileSync(outputPath);
        await sock.sendMessage(m.key.remoteJid, {
            video: outBuffer,
            mimetype: "video/mp4",
            caption: `🔊 *Video volume adjusted to ${Math.round(volumeMultiplier * 100)}%.*`
        }, { quoted: m });

        return null;
    } catch (error) {
        console.error("volvideo error:", error.message);
        return `❌ Failed to adjust video volume: ${error.message}`;
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
};

export const truthordare = async (sock, m, args) => {
    const choice = (args[0] || "").toLowerCase();

    if (choice === "truth") return truth(sock, m, args.slice(1));
    if (choice === "dare") return dare(sock, m, args.slice(1));

    return Math.random() < 0.5
        ? truth(sock, m, args)
        : dare(sock, m, args);
};

export const feedback = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const message = args.join(" ").trim();

    if (!message) {
        return `╔══════════════════════════════════╗
║     💬 *𝔽𝔼𝔼𝔻𝔹𝔸ℂ𝕂* 💬             ║
╚══════════════════════════════════╝

*Usage:* ${p}feedback <your message>
*Example:* ${p}feedback I like the new menu design`;
    }

    const ownerDigits = String(config.ownerNumber || config.phone || sock.user?.id || "")
        .replace(/\D/g, "");
    const ownerJid = ownerDigits ? `${ownerDigits}@s.whatsapp.net` : null;
    const senderJid = m.key.participant || m.key.remoteJid;
    const senderNumber = senderJid?.split("@")[0] || "unknown";

    if (ownerJid) {
        try {
            await sock.sendMessage(ownerJid, {
                text: `💬 *New Feedback Received*\n\n👤 From: ${senderNumber}\n📝 Message: ${message}`
            });
        } catch (error) {
            console.error("feedback forward error:", error.message);
        }
    }

    return `╔══════════════════════════════════╗
║     ✅ *𝔽𝔼𝔼𝔻𝔹𝔸ℂ𝕂 𝕊𝔼ℕ𝕋* ✅        ║
╚══════════════════════════════════╝

Thanks for your feedback.

📝 *Your message:* ${message}`;
};

export const shazam = async (sock, m) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.audioMessage && !quoted?.videoMessage) {
        return `Reply to an audio or video with *${p}shazam* to identify the music.`;
    }

    if (!AUDD_API_TOKEN) {
        return `❌ *Shazam is unavailable.* Add *AUDD_API_TOKEN* to backend/.env to enable song recognition.`;
    }

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        const form = new FormData();
        form.append("api_token", AUDD_API_TOKEN);
        form.append("return", "apple_music,spotify");
        form.append("file", new Blob([buffer]), "audio.mp3");

        const response = await fetch("https://api.audd.io/", {
            method: "POST",
            body: form
        });

        const data = await response.json();
        const result = data?.result;

        if (!result) {
            return `❌ Could not identify any song from that media.`;
        }

        return `╔══════════════════════════════════╗
║      🎵 *𝕊ℍ𝔸ℤ𝔸𝕄* 🎵               ║
╚══════════════════════════════════╝

🎶 *Title:* ${result.title || "Unknown"}
👤 *Artist:* ${result.artist || "Unknown"}
💿 *Album:* ${result.album || "Unknown"}
📅 *Release:* ${result.release_date || "Unknown"}
🔗 *Preview:* ${result.song_link || result.spotify?.external_urls?.spotify || "N/A"}`;
    } catch (error) {
        console.error("shazam error:", error.message);
        return `❌ Shazam failed: ${error.message}`;
    }
};
