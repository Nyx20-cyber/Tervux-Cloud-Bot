import { getCachedConfig } from "../../services/configService.js";

export const base64 = async (sock, m, args) => {
    const action = args[0]?.toLowerCase();
    const text = args.slice(1).join(" ");

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!action || !text || !["encode", "decode"].includes(action)) {
        return `╔══════════════════════════════════╗
║   🔣 *𝔹𝔸𝕊𝔼𝟞𝟜* 🔣                  ║
╚══════════════════════════════════╝

*Usage:*
• *${p}base64 encode* <text>
• *${p}base64 decode* <encoded text>

*Example:*
• *${p}base64 encode* Hello World
• *${p}base64 decode* SGVsbG8gV29ybGQ=`;
    }

    try {
        if (action === "encode") {
            const encoded = Buffer.from(text).toString("base64");
            return `╔══════════════════════════════════╗
║   🔣 *𝔹𝔸𝕊𝔼𝟞𝟜 𝔼ℕℂ𝕆𝔻𝔼* 🔣           ║
╚══════════════════════════════════╝

📝 *Input:*
${text}

🔐 *Encoded:*
\`\`\`${encoded}\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Copy the encoded text above_ ✂️`;
        } else {
            const decoded = Buffer.from(text, "base64").toString("utf-8");
            return `╔══════════════════════════════════╗
║   🔣 *𝔹𝔸𝕊𝔼𝟞𝟜 𝔻𝔼ℂ𝕆𝔻𝔼* 🔣           ║
╚══════════════════════════════════╝

🔐 *Input:*
${text}

📝 *Decoded:*
\`\`\`${decoded}\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_The original text is above_ 📖`;
        }
    } catch (err) {
        return `❌ *Base64 ${action} failed*

💡 _Make sure the input is valid._`;
    }
};
