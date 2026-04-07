import { getCachedConfig, updateConfig } from "../../services/configService.js";

// Helper for toggle commands
const createToggle = (settingKey, displayName) => async (sock, m, args, ctx = {}) => {
    const config = ctx.config || await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const value = args[0]?.toLowerCase();

    if (value !== "on" && value !== "off") {
        return `╔══════════════════════════════════╗
║         ❓ *ℍ𝔼𝕃ℙ* ❓             ║
╚══════════════════════════════════╝

📝 *U𝕤𝕒𝕘𝕖:* ${p}${displayName.toLowerCase().replace(/ /g, "")} on/off
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}${displayName.toLowerCase().replace(/ /g, "")} on`;
    }

    const newValue = value === "on";
    const updatedSession = await updateConfig(sock.sessionId, { [settingKey]: newValue });
    if (updatedSession && ctx.sessionManager?.primeSessionRuntimeFromDocument) {
        await ctx.sessionManager.primeSessionRuntimeFromDocument(updatedSession);
    } else if (ctx.sessionManager?.invalidateConfigCache) {
        ctx.sessionManager.invalidateConfigCache(sock.sessionId);
    }

    return `╔══════════════════════════════════╗
║    ✅ *𝕊𝔼𝕋𝕋𝕀ℕ𝔾 𝕌ℙ𝔻𝔸𝕋𝔼𝔻* ✅      ║
╚══════════════════════════════════╝

🔧 *${displayName}:* ${newValue ? "Enabled ✅" : "Disabled ❌"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Settings saved successfully!_`;
};

export const alwaysonline = createToggle("alwaysOnline", "Always Online");
export const autolikestatus = createToggle("autoLikeStatus", "Auto Like Status");
export const autoviewstatus = createToggle("autoViewStatus", "Auto View Status");
export const antidelete = createToggle("antiDelete", "Anti Delete");
export const antideletep = createToggle("antiDelete", "Private Anti Delete");
export const anticall = createToggle("antiCall", "Anti Call");
export const autoread = createToggle("autoReadMessages", "Auto Read");
export const alwaystyping = createToggle("alwaysTyping", "Always Typing");
export const alwaysrecording = createToggle("alwaysRecording", "Always Recording");
