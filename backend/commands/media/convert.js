import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { promisify } from "util";
import { sticker as createSticker } from "../tools/sticker.js";
import { getCachedConfig } from "../../services/configService.js";

const execPromise = promisify(exec);

export const convert = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const remoteJid = m.key.remoteJid;
    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        return "⚠️ Please reply to an Image, Video, or Audio to convert it.";
    }

    const targetFormat = args[0]?.toLowerCase();
    if (!targetFormat) {
        return `╔══════════════════════════════════╗
║    🔄 *𝕄𝔼𝔻𝕀𝔸 ℂ𝕆ℕ𝕍𝔼ℝ𝕋𝔼ℝ* 🔄      ║
╚══════════════════════════════════╝

Convert replied media into audio, voice note, PDF, document, or sticker format.

*Usage:* Reply to media with:
• *${p}convert tomp3* (Video/Audio -> MP3)
• *${p}convert tovn* (Video/Audio -> Voice Note)
• *${p}convert topdf* (Image -> PDF)
• *${p}convert todoc* (Any -> Document)
• *${p}convert tosticker* (Image/Video -> Sticker)

🛡️ *Careful & Professional Conversion!*`;
    }

    const isImage = !!quoted.imageMessage;
    const isVideo = !!quoted.videoMessage;
    const isAudio = !!quoted.audioMessage;
    const isDoc = !!quoted.documentMessage;

    const tempPrefix = `conv_${Date.now()}`;
    const tempInput = path.join("/tmp", `${tempPrefix}_in`);
    const tempOutput = path.join("/tmp", `${tempPrefix}_out`);

    try {
        // --- 1. DOWNLOAD MEDIA ---
        const buffer = await downloadMediaMessage(
            { message: quoted },
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
        );

        if (targetFormat === "tosticker") {
            return await createSticker(sock, m, []);
        }

        if (targetFormat === "todoc") {
            const mime = isImage ? "image/jpeg" : (isVideo ? "video/mp4" : (isAudio ? "audio/mpeg" : "application/octet-stream"));
            const ext = isImage ? ".jpg" : (isVideo ? ".mp4" : (isAudio ? ".mp3" : ".bin"));
            await sock.sendMessage(remoteJid, {
                document: buffer,
                mimetype: mime,
                fileName: `Tervux_${Date.now()}${ext}`
            }, { quoted: m });
            return;
        }

        // --- 2. FFMPEG CONVERSIONS ---
        if (targetFormat === "tomp3" || targetFormat === "toaudio") {
            if (!isVideo && !isAudio) return "⚠️ Reply to a Video or Audio to convert to MP3.";
            fs.writeFileSync(tempInput, buffer);
            await execPromise(`ffmpeg -i ${tempInput} -vn -acodec libmp3lame -q:a 2 ${tempOutput}.mp3`);
            const outBuffer = fs.readFileSync(`${tempOutput}.mp3`);
            await sock.sendMessage(remoteJid, { audio: outBuffer, mimetype: "audio/mpeg" }, { quoted: m });
        } 
        else if (targetFormat === "tovn") {
            if (!isVideo && !isAudio) return "⚠️ Reply to a Video or Audio to convert to Voice Note.";
            fs.writeFileSync(tempInput, buffer);
            await execPromise(`ffmpeg -i ${tempInput} -vn -acodec libopus -b:a 128k -vbr on ${tempOutput}.opus`);
            const outBuffer = fs.readFileSync(`${tempOutput}.opus`);
            await sock.sendMessage(remoteJid, { audio: outBuffer, mimetype: "audio/mp4", ptt: true }, { quoted: m });
        }
        else if (targetFormat === "topdf") {
            if (!isImage) return "⚠️ Reply to an Image to convert it to PDF.";
            fs.writeFileSync(tempInput, buffer);
            // FFmpeg can wrap image into PDF effectively
            await execPromise(`ffmpeg -i ${tempInput} ${tempOutput}.pdf`);
            const outBuffer = fs.readFileSync(`${tempOutput}.pdf`);
            await sock.sendMessage(remoteJid, { 
                document: outBuffer, 
                mimetype: "application/pdf", 
                fileName: `Tervux_Doc_${Date.now()}.pdf` 
            }, { quoted: m });
        }
        else {
            return `❌ Unknown format: *${targetFormat}*. Use *${p}convert* to see supported formats.`;
        }

        // --- 3. CLEANUP ---
        const files = fs.readdirSync("/tmp").filter(f => f.startsWith(tempPrefix));
        files.forEach(f => fs.unlinkSync(path.join("/tmp", f)));

    } catch (err) {
        console.error("Conversion error:", err.message);
        return `❌ Conversion failed: ${err.message}`;
    }
};
