export const ping = async (sock, m, args, ctx = {}) => {
  const queueWaitMs = Number(ctx.commandTiming?.queueWaitMs || 0);
  const ingressAgeMs = Number(ctx.commandTiming?.ingressAgeMs || 0);
  const parseMs = Number(ctx.commandTiming?.parseMs || 0);
  const latency = queueWaitMs + parseMs;

  return `╔══════════════════════════════════╗
║        🏓 *ℙ𝕆ℕ𝔾!* 🏓             ║
╚══════════════════════════════════╝

⚡ *ℝ𝕖𝕤𝕡𝕠𝕟𝕤𝕖 𝕋𝕚𝕞𝕖:* ${latency}ms
📥 *Message Age:* ${ingressAgeMs}ms
🟢 *𝕊𝕥𝕒𝕥𝕦𝕤:* Bot is online!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕃𝕆𝕌𝔻 𝔹𝕆𝕋 is alive and ready!*`;
};
