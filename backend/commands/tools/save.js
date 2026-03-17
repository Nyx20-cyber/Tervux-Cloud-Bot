import { downloadMediaMessage, jidNormalizedUser } from "@whiskeysockets/baileys";
import { getCachedConfig } from "../../services/configService.js";

export const save = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    
    // Safety check: only the owner can use this (or the bot itself)
    const senderRaw = m.key.participant || m.key.remoteJid || "";
    const senderJid = senderRaw ? jidNormalizedUser(senderRaw) : "";
    const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : "";
    
    if (senderJid !== botJid) {
        return "🚫 This is a private utility tool for the bot owner only.";
    }

    // Determine the message containing the media
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const msg = quoted ? quoted : m.message;
    
    // Check for media
    const mediaType = Object.keys(msg || {}).find(key => 
        ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(key)
    );

    if (!mediaType) {
        return `╔══════════════════════════════════╗
║     📥 *𝕊𝔸𝕍𝔼 𝕄𝔼𝔻𝕀𝔸* 📥           ║
╚══════════════════════════════════╝

This command forwards a photo, video, voice note, sticker, or document to your private chat.

*How to use:*

1️⃣ Reply to a photo, video, or voice note with *${p}save*
2️⃣ Or send media with the caption *${p}save*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 _The bot will send it to your private chat!_`;
    }

    try {
        console.log(`📥 Downloading media to save... Type: ${mediaType}`);

        // Download to memory buffer
        const buffer = await downloadMediaMessage(
            m.message?.extendedTextMessage?.contextInfo ? { message: quoted } : m,
            "buffer",
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        );

        if (!buffer) throw new Error("Could not download media.");

        const mediaObj = msg[mediaType];
        const caption = mediaObj.caption || `Saved from group: ${m.key.remoteJid.split("@")[0]}`;

        // Forward to owner (private chat)
        await sock.sendMessage(botJid, {
            [mediaType.replace("Message", "")]: buffer,
            caption: caption,
            mimetype: mediaObj.mimetype,
            fileName: mediaObj.fileName || "saved_media"
        });

        return "✅ Media saved and sent to your private chat!";
    } catch (err) {
        console.error("❌ Save error:", err.message);
        return `❌ *Failed to save media*
        
*Error:* ${err.message}`;
    }
};
