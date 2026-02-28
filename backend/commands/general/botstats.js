export const botstats = async (sock, m, args) => {
    try {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

        const memory = process.memoryUsage();
        const rssMB = (memory.rss / 1024 / 1024).toFixed(1);
        const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(1);

        // Memory bar visualization
        const memoryPercent = Math.min(100, (rssMB / 512) * 100);
        const filled = Math.floor(memoryPercent / 10);
        const memoryBar = "▓".repeat(filled) + "░".repeat(10 - filled);

        return `╔══════════════════════════════════╗
║   📊 *𝕋𝔼ℝ𝕍𝕌𝕏 𝔹𝕆𝕋 𝕊𝕋𝔸𝕋𝕊* 📊    ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️ *𝕊𝕐𝕊𝕋𝔼𝕄 𝕊𝕋𝔸𝕋𝕌𝕊*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 *𝕊𝕥𝕒𝕥𝕦𝕤:* Online
⏱️ *𝕌𝕡𝕥𝕚𝕞𝕖:* ${uptimeString}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 *𝕄𝔼𝕄𝕆ℝ𝕐 𝕌𝕊𝔸𝔾𝔼*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 *ℝ𝔸𝕄:* ${rssMB}MB
📊 *ℍ𝕖𝕒𝕡:* ${heapMB}MB
📈 *𝕃𝕠𝕒𝕕:* [${memoryBar}] ${memoryPercent.toFixed(0)}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕎𝕙𝕒𝕥𝕤𝔸𝕡𝕡 𝔹𝕠𝕥*
_𝕊𝕖𝕝𝕗-𝕙𝕠𝕤𝕥𝕖𝕕 𝕡𝕖𝕣𝕤𝕠𝕟𝕒𝕝 𝕒𝕤𝕤𝕚𝕤𝕥𝕒𝕟𝕥_`;

    } catch (error) {
        console.error("Stats command error:", error);
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to fetch system stats.
Please try again later.`;
    }
};
