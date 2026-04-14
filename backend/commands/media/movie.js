import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";
import { OMDB_API_KEY } from "../../env.js";

export const movie = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ");
    if (!query) {
        return `╔══════════════════════════════════╗
║    🎬 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕄𝕆𝕍𝕀𝔼𝕊* 🎬         ║
╚══════════════════════════════════╝

📝 *𝕌𝕤𝕒𝕘𝕖:* ${p}movie [name]
📌 *𝔼𝕩𝕒𝕞𝕡𝕝𝕖:* ${p}movie Avengers Endgame

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Search any movie from IMDB! 🎥`;
    }

    try {
        if (!OMDB_API_KEY) {
            return `❌ *Movie search is unavailable.* Add *OMDB_API_KEY* to backend/.env to enable this command.`;
        }

        const response = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=${OMDB_API_KEY}`, { timeout: 15000 });
        const data = response.data;

        if (data && data.Response === "True") {
            const message = `╔══════════════════════════════════╗
║      🎬 *𝕄𝕆𝕍𝕀𝔼 𝕀ℕ𝔽𝕆* 🎬          ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *𝔻𝔼𝕋𝔸𝕀𝕃𝕊*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *𝕋𝕚𝕥𝕝𝕖:* ${data.Title}
📅 *ℝ𝕖𝕝𝕖𝕒𝕤𝕖𝕕:* ${data.Released}
⏱️ *ℝ𝕦𝕟𝕥𝕚𝕞𝕖:* ${data.Runtime}
🎭 *𝔾𝕖𝕟𝕣𝕖:* ${data.Genre}
🎬 *𝔻𝕚𝕣𝕖𝕔𝕥𝕠𝕣:* ${data.Director}
⭐ *ℝ𝕒𝕥𝕚𝕟𝕘:* ${data.imdbRating} (${data.imdbVotes} votes)
🏆 *𝔸𝕨𝕒𝕣𝕕𝕤:* ${data.Awards}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 *ℙ𝕃𝕆𝕋*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.Plot}`;

            // Try to send with poster if available
            if (data.Poster && data.Poster !== "N/A") {
                try {
                    const posterRes = await axios.get(data.Poster, { responseType: 'arraybuffer', timeout: 10000 });
                    return {
                        image: Buffer.from(posterRes.data),
                        caption: message
                    };
                } catch (e) {
                    console.warn("Movie poster download failed, sending text:", e.message);
                    return message;
                }
            }
            return message;
        }

        return `╔══════════════════════════════════╗
║       ❌ *ℕ𝕆𝕋 𝔽𝕆𝕌ℕ掛* ❌          ║
╚══════════════════════════════════╝

Movie "${query}" not found.
Try a different search term.`;
    } catch (err) {
        console.error("Movie error:", err.message);
        return `╔══════════════════════════════════╗
║         ❌ *𝔼ℝℝ𝕆ℝ* ❌            ║
╚══════════════════════════════════╝

Failed to fetch movie details.
Error: ${err.message}`;
    }
};
