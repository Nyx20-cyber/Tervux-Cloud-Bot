import { getCachedConfig, updateConfig } from "../../services/configService.js";

// Allowed prefix symbols - single special characters only
const ALLOWED_PREFIXES = ["!", ".", "/", "#", "$", "%", "^", "&", "*", "-", "+", "=", "~", "?", ";", ":", ">", "<", "|", "\\"];

export const prefix = async (sock, m, args, ctx = {}) => {
    const config = ctx.config || await getCachedConfig(sock.sessionId);
    const newPrefix = args[0];

    if (!newPrefix) {
        return `╔══════════════════════════════════╗
║   ⚙️ *𝔹𝕆𝕋 ℙℝ𝔼𝔽𝕀𝕏* ⚙️             ║
╚══════════════════════════════════╝

*Current Prefix:* ${config.prefix || "!"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *ℍ𝕆𝕎 𝕋𝕆 ℂℍ𝔸ℕ𝔾𝔼*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• *${config.prefix}prefix .* → Change to .
• *${config.prefix}prefix /* → Change to /
• *${config.prefix}prefix #* → Change to #

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *𝔸𝕃𝕃𝕆𝕎𝔼𝔻 𝕊𝕐𝕄𝔹𝕆𝕃𝕊*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ALLOWED_PREFIXES.join("  ")}

⚠️ _Must be exactly 1 symbol character._
🔄 _Default prefix is_ *!*`;
    }

    // Must be exactly 1 character
    if (newPrefix.length !== 1) {
        return `╔══════════════════════════════════╗
║   ❌ *ℙℝ𝔼𝔽𝕀𝕏 𝔼ℝℝ𝕆ℝ* ❌             ║
╚══════════════════════════════════╝

*Reason:* Prefix must be exactly *1 character*.
*You entered:* "${newPrefix}" (${newPrefix.length} characters)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *Example:*
• *${config.prefix}prefix .* ✅ (1 character)
• *${config.prefix}prefix !!* ❌ (2 characters)`;
    }

    // Must be a symbol, not a letter or number
    if (/[a-zA-Z0-9\s]/.test(newPrefix)) {
        return `╔══════════════════════════════════╗
║   ❌ *ℙℝ𝔼𝔽𝕀𝕏 𝔼ℝℝ𝕆ℝ* ❌             ║
╚══════════════════════════════════╝

*Reason:* Prefix must be a *symbol*, not a letter or number.
*You entered:* "${newPrefix}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *Allowed symbols:*
${ALLOWED_PREFIXES.join("  ")}

❌ *Not allowed:* Letters (a-z), Numbers (0-9), Spaces`;
    }

    // Check if it's the same prefix
    if (newPrefix === config.prefix) {
        return `╔══════════════════════════════════╗
║   ⚠️ *ℕ𝕆 ℂℍ𝔸ℕ𝔾𝔼* ⚠️              ║
╚══════════════════════════════════╝

*"${newPrefix}"* is already the current prefix!
No changes were made.`;
    }

    const oldPrefix = config.prefix || "!";

    try {
        const updatedSession = await updateConfig(sock.sessionId, { prefix: newPrefix });
        if (updatedSession && ctx.sessionManager?.primeSessionRuntimeFromDocument) {
            await ctx.sessionManager.primeSessionRuntimeFromDocument(updatedSession);
        } else if (ctx.sessionManager?.invalidateConfigCache) {
            ctx.sessionManager.invalidateConfigCache(sock.sessionId);
        }

        if (updatedSession) {
            return `╔══════════════════════════════════╗
║   ✅ *ℙℝ𝔼𝔽𝕀𝕏 𝕌ℙ𝔻𝔸𝕋𝔼𝔻* ✅          ║
╚══════════════════════════════════╝

• *Old Prefix:* ${oldPrefix}
• *New Prefix:* ${newPrefix}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 All commands now start with *${newPrefix}*
📋 Try *${newPrefix}help* to see them.
🔄 Use *${newPrefix}prefix !* to reset to default.`;
        }

        return `╔══════════════════════════════════╗
║   ❌ *𝕊𝔸𝕍𝔼 𝔽𝔸𝕀𝕃𝔼𝔻* ❌              ║
╚══════════════════════════════════╝

*Reason:* Could not save to config.json
*Possible causes:*
• File permission error
• Disk is full
• config.json is corrupted

💡 _Try restarting the bot and try again._`;
    } catch (err) {
        console.error("❌ Prefix update error:", err.message);
        return `╔══════════════════════════════════╗
║   ❌ *𝕌ℕ𝔼𝕏ℙ𝔼ℂ𝕋𝔼𝔻 𝔼ℝℝ𝕆ℝ* ❌       ║
╚══════════════════════════════════╝

*Error:* ${err.message}

💡 _Check bot console for details._
🔄 _Current prefix remains:_ *${oldPrefix}*`;
    }
};
