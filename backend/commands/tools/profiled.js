import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";

/**
 * !profiled command
 * Fetches target user's profile picture and sends it to the owner (sudo).
 */
export const profiled = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    const config = await getCachedConfig(sock.sessionId);
    const ownerJid = config.ownerNumber ? `${config.ownerNumber.replace(/\D/g, "")}@s.whatsapp.net` : sock.user.id.split(":")[0] + "@s.whatsapp.net";

    let targetJid;

    // 1. Detect Target JID
    const quoted = m.message.extendedTextMessage?.contextInfo?.participant || 
                   m.message.extendedTextMessage?.contextInfo?.quotedMessage?.participant;
    const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (quoted) {
        targetJid = quoted;
    } else if (mentioned) {
        targetJid = mentioned;
    } else if (args[0]) {
        targetJid = args[0].replace(/\D/g, "") + "@s.whatsapp.net";
    } else {
        targetJid = m.key.participant || remoteJid; // Fallback to sender or current chat
    }

    try {
        // 2. Get Profile Picture URL (High Res)
        let ppUrl;
        try {
            ppUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch (e) {
            return "❌ No profile picture found or privacy settings prevent fetching.";
        }

        if (!ppUrl) {
            return "❌ This user has no profile picture.";
        }

        // 3. Download Buffer
        const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // 4. Send to Owner (Sudo)
        const targetNumber = targetJid.split("@")[0];
        await sock.sendMessage(ownerJid, {
            image: buffer,
            caption: `📸 *ℙℝ𝕆𝔽𝕀𝕃𝔼 ℙ𝕀ℂ𝕋𝕌ℝ𝔼 𝔻𝕆𝕎ℕ𝕃𝕆𝔸𝔻𝔼ℝ*\n\n👤 *𝕋𝕒𝕣𝕘𝕖𝕥:* @${targetNumber}\n🆔 *𝕁𝕀𝔻:* ${targetJid}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Forwarded to Sudo Number successfully._`,
            mentions: [targetJid]
        });

        // 5. Notify the command invoker
        return `✅ Profile picture of @${targetNumber} has been downloaded and sent to the *Sudo Number*.`;

    } catch (err) {
        console.error("Profiled Command Error:", err.message);
        return `❌ Error fetching profile picture: ${err.message}`;
    }
};
