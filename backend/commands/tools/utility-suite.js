import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";
import { password } from "./password.js";

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

function escapePdfText(text = "") {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(text = "") {
    const lines = text.split(/\r?\n/);
    const safeLines = lines.slice(0, 120).map((line) => escapePdfText(line.slice(0, 90)));

    let y = 780;
    const commands = ["BT", "/F1 12 Tf"];
    for (const line of safeLines) {
        commands.push(`1 0 0 1 72 ${y} Tm`);
        commands.push(`(${line || " "}) Tj`);
        y -= 16;
        if (y < 60) break;
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const streamLength = Buffer.byteLength(stream, "utf8");

    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
        "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
        `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj`
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf, "utf8"));
        pdf += `${obj}\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i < offsets.length; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, "utf8");
}

export const reverse = async (sock, m) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.audioMessage) {
        return `Reply to an audio or voice note with *${p}reverse* to reverse it.`;
    }

    const tempId = Date.now();
    const inputPath = path.join("/tmp", `reverse_${tempId}_in`);
    const outputPath = path.join("/tmp", `reverse_${tempId}_out.mp3`);

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        await fs.writeFile(inputPath, buffer);
        await execPromise(`ffmpeg -y -i ${inputPath} -af "areverse" ${outputPath}`);
        const output = await fs.readFile(outputPath);

        await sock.sendMessage(m.key.remoteJid, {
            audio: output,
            mimetype: "audio/mp4",
            ptt: !!quoted.audioMessage?.ptt
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Failed to reverse audio: ${error.message}`;
    } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
    }
};

export const toptt = async (sock, m, args) => {
    const { convert } = await import("../media/convert.js");
    return convert(sock, m, ["tovn", ...args]);
};

export const volaudio = async (sock, m, args) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.audioMessage) {
        return `Reply to an audio or voice note with *${p}volaudio 150* to change the volume.`;
    }

    const volumePercent = Number.parseInt(args[0] || "150", 10);
    const volumeMultiplier = Math.max(10, Math.min(500, volumePercent)) / 100;
    const tempId = Date.now();
    const inputPath = path.join("/tmp", `volaudio_${tempId}_in`);
    const outputPath = path.join("/tmp", `volaudio_${tempId}_out.mp3`);

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        await fs.writeFile(inputPath, buffer);
        await execPromise(`ffmpeg -y -i ${inputPath} -af "volume=${volumeMultiplier}" ${outputPath}`);
        const output = await fs.readFile(outputPath);

        await sock.sendMessage(m.key.remoteJid, {
            audio: output,
            mimetype: "audio/mp4",
            ptt: !!quoted.audioMessage?.ptt
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Failed to adjust audio volume: ${error.message}`;
    } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
    }
};

export const genpass = async (sock, m, args) => password(sock, m, args);

export const fliptext = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const text = args.join(" ");

    if (!text) {
        return `📝 *Usage:* ${p}fliptext <text>`;
    }

    const flipped = text.split("").reverse().join("");
    return `╔══════════════════════════════════╗
║      🔄 *𝔽𝕃𝕀ℙ 𝕋𝔼𝕏𝕋* 🔄           ║
╚══════════════════════════════════╝

📝 *Original:* ${text}
🔁 *Flipped:* ${flipped}`;
};

export const getpp = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const contextInfo = m.message?.extendedTextMessage?.contextInfo || {};
    const targetJid = contextInfo.participant
        || contextInfo.mentionedJid?.[0]
        || (args[0] ? `${args[0].replace(/\D/g, "")}@s.whatsapp.net` : (m.key.participant || m.key.remoteJid));

    if (!targetJid) {
        return `📝 *Usage:* ${p}getpp <number>\n💡 You can also reply to someone or mention them.`;
    }

    try {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image");
        const response = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 10000 });
        return {
            image: Buffer.from(response.data),
            caption: `📸 *Profile Picture*\n\n👤 ${targetJid.split("@")[0]}`
        };
    } catch {
        return `❌ Could not fetch that profile picture.`;
    }
};

export const obfuscate = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const text = args.join(" ");

    if (!text) {
        return `📝 *Usage:* ${p}obfuscate <text>`;
    }

    const hexEscaped = text
        .split("")
        .map((char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("");

    return `╔══════════════════════════════════╗
║    🕶️ *𝕆𝔹𝔽𝕌𝕊ℂ𝔸𝕋𝔼* 🕶️            ║
╚══════════════════════════════════╝

📝 *Input:* ${text}
🔐 *Obfuscated:* \`\`\`${hexEscaped}\`\`\``;
};

export const texttopdf = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const quotedText = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
        || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text
        || "";
    const text = args.join(" ").trim() || quotedText.trim();

    if (!text) {
        return `📝 *Usage:* ${p}texttopdf <text>\n💡 You can also reply to a text message with *${p}texttopdf*.`;
    }

    const pdfBuffer = buildSimplePdf(text);
    await sock.sendMessage(m.key.remoteJid, {
        document: pdfBuffer,
        mimetype: "application/pdf",
        fileName: `tervux-text-${Date.now()}.pdf`
    }, { quoted: m });
    return null;
};

export const toimage = async (sock, m) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.stickerMessage) {
        return `Reply to a sticker with *${p}toimage* to convert it to PNG.`;
    }

    const tempId = Date.now();
    const inputPath = path.join("/tmp", `toimage_${tempId}.webp`);
    const outputPath = path.join("/tmp", `toimage_${tempId}.png`);

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        await fs.writeFile(inputPath, buffer);
        await execPromise(`ffmpeg -y -i ${inputPath} ${outputPath}`);
        const imageBuffer = await fs.readFile(outputPath);

        await sock.sendMessage(m.key.remoteJid, {
            image: imageBuffer,
            caption: "🖼️ *Sticker converted to image.*"
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Failed to convert sticker to image: ${error.message}`;
    } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
    }
};

export const helpers = async (sock) => {
    const ownerDigits = String(sock.user?.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    return `╔══════════════════════════════════╗
║      🤝 *ℍ𝔼𝕃ℙ𝔼ℝ𝕊* 🤝            ║
╚══════════════════════════════════╝

• *Support:* bot.tervux.com
• *WhatsApp Owner:* ${ownerDigits ? `wa.me/${ownerDigits}` : "Available in session"}
• *Website:* www.tervux.com
• *Creator:* Nyaganya Malima Nyaganya

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Use this if you need setup or bot help._`;
};
