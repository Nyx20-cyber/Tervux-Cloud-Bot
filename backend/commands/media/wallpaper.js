import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";

const categories = [
    "nature", "wallpapers", "architecture", "travel", "textures-patterns",
    "street-photography", "animals", "food-drink"
];

export const wallpaper = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const chatJid = m.key.remoteJid;
    const query = args.join(" ") || categories[Math.floor(Math.random() * categories.length)];

    try {
        // Use Wallhaven API for high-quality searchable wallpapers
        const searchUrl = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&sorting=random`;

        const searchResponse = await axios.get(searchUrl, { timeout: 15000 });
        const images = searchResponse.data?.data;

        if (!images || images.length === 0) {
            return `❌ *No wallpapers found* for "${query}". Try another search!`;
        }

        // Pick the first random image from results
        const imageUrl = images[0].path;

        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 25000,
            maxRedirects: 10,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
                "Accept": "image/*"
            }
        });

        if (!response.data || response.data.length < 100) {
            throw new Error(`Invalid image data received (Length: ${response.data?.length || 0})`);
        }

        const caption = `╔══════════════════════════════════╗
║   🖼️ *ℍ𝔻 𝕎𝔸𝕃𝕃ℙ𝔸ℙ𝔼ℝ* 🖼️            ║
╚══════════════════════════════════╝

🏷️ *Category:* ${query}
🔗 *Source:* Wallhaven

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This command fetches a wallpaper based on your search or a random category.

💡 *Tips:*
• *${p}wallpaper ${query}* → more like this
• *${p}wallpaper* → random wallpaper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Send again for a new wallpaper_ 🔄`;

        await sock.sendMessage(chatJid, {
            image: Buffer.from(response.data),
            caption
        }, { quoted: m });

        return null;
    } catch (err) {
        console.error("❌ Wallpaper Debug Error:", err);

        let errorMessage = err.message || "Unknown error";
        if (err.response) {
            errorMessage = `API Error ${err.response.status}: ${err.response.statusText}`;
        } else if (err.request) {
            errorMessage = "Connection timeout. Please try again.";
        }

        return `❌ *Failed to fetch wallpaper*
_Error: ${errorMessage}_

💡 _Try a different category or try again._
*Example:* ${p}wallpaper sunset`;
    }
};
