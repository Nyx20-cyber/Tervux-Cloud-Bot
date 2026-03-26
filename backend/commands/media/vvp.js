import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { getCachedConfig } from "../../services/configService.js";

export const vvp = async (sock, m, args, ctx = {}) => {
    try {
        const config = ctx.config || await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        const quotedMsgId = m.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsgId || !quotedMessage) {
            return `╔══════════════════════════════════╗\n║   👁️ *𝕋𝔼ℝ𝕍𝕌X 𝕍𝕀𝔼𝕎 𝕆ℕℂ𝔼 ℙℝ𝕀𝕍𝔸𝕋𝔼* 👁️ ║\n╚══════════════════════════════════╝\n\nThis command opens a View Once photo, video, or voice note and sends it to your PM.\n\n❌ *Error:* Please reply to a View Once message with *${p}vvp* to open it.`;
        }

        const sessionManager = sock.__sessionManager;
        const session = sessionManager?.sessions?.get(sock.sessionId);
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

        console.log(`👁️ [${sock.sessionId}] Opening View Once Private (${type}) for ${quotedMsgId}`);

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
            messageOptions.caption = caption || "🔓 *View Once Unlocked (Private)*";
        } else if (type === 'videoMessage') {
            messageOptions.video = buffer;
            messageOptions.caption = caption || "🔓 *View Once Unlocked (Private)*";
        } else if (type === 'audioMessage') {
            messageOptions.audio = buffer;
            messageOptions.mimetype = mimetype;
            messageOptions.ptt = mediaMsg.ptt || false;
        }

        // The sudo number is the bot owner itself
        const ownerId = sock.user.id.split("@")[0].split(":")[0];
        const ownerJid = `${ownerId}@s.whatsapp.net`;

        await sock.sendMessage(ownerJid, messageOptions);
        
        return "✅ *Sent to the bot owner's PM!*";

    } catch (err) {
        console.error("VVP Command Error:", err.message);
        return `❌ *Failed to open View Once message:* ${err.message}`;
    }
};
