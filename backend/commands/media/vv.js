import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { sessionManager } from "../../services/whatsappService.js";

export const vv = async (sock, m, args) => {
    try {
        const quotedMsgId = m.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsgId || !quotedMessage) {
            return "╔══════════════════════════════════╗\n║   👁️ *𝕋𝔼ℝ𝕍𝕌X 𝕍𝕀𝔼𝕎 𝕆ℕℂ𝔼* 👁️      ║\n╚══════════════════════════════════╝\n\n❌ *Error:* Please reply to a View Once message with *!vv* to open it.";
        }

        const session = sessionManager.sessions.get(sock.sessionId);
        if (!session) {
            return "❌ *Error:* Session not found.";
        }

        // Retrieve from cache if possible, because quotedMessage context often lacks indices
        const cachedEntry = session.messageCache.get(quotedMsgId);
        let msg = cachedEntry ? cachedEntry.message : quotedMessage;

        // Unwrap various message wrappers
        if (msg.viewOnceMessage) msg = msg.viewOnceMessage.message;
        if (msg.viewOnceMessageV2) msg = msg.viewOnceMessageV2.message;
        if (msg.ephemeralMessage) msg = msg.ephemeralMessage.message;

        const type = Object.keys(msg)[0];
        const validTypes = ['imageMessage', 'videoMessage', 'audioMessage'];

        if (!validTypes.includes(type)) {
            return "❌ *Error:* The quoted message is not a View Once image, video, or voice message.";
        }

        console.log(`👁️ [${sock.sessionId}] Opening View Once (${type}) for ${quotedMsgId}`);

        // Download the media
        const buffer = await downloadMediaMessage(
            { message: msg },
            "buffer",
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        );

        if (!buffer) {
            throw new Error("Failed to download media buffer. It might have expired or was already opened.");
        }

        // Identify MIME and type
        const mediaMsg = msg[type];
        const mimetype = mediaMsg.mimetype || "";
        const caption = mediaMsg.caption || "";

        // Send back as regular media
        const messageOptions = {};
        if (type === 'imageMessage') {
            messageOptions.image = buffer;
            messageOptions.caption = caption || "🔓 *View Once Unlocked*";
        } else if (type === 'videoMessage') {
            messageOptions.video = buffer;
            messageOptions.caption = caption || "🔓 *View Once Unlocked*";
        } else if (type === 'audioMessage') {
            messageOptions.audio = buffer;
            messageOptions.mimetype = mimetype;
            messageOptions.ptt = mediaMsg.ptt || false;
        }

        await sock.sendMessage(m.key.remoteJid, messageOptions, { quoted: m });
        return null;

    } catch (err) {
        console.error("VV Command Error:", err.message);
        return `❌ *Failed to open View Once message:* ${err.message}`;
    }
};
