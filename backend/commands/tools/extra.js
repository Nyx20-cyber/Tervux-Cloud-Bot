import axios from "axios";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getCachedConfig } from "../../services/configService.js";
import { SERPAPI_KEY } from "../../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, "../../package.json");

let cachedPackageMeta = null;

async function getPackageMeta() {
    if (cachedPackageMeta) return cachedPackageMeta;

    try {
        const raw = await readFile(packageJsonPath, "utf8");
        cachedPackageMeta = JSON.parse(raw);
    } catch (error) {
        cachedPackageMeta = {
            name: "tervux-whatsapp-bot",
            version: "unknown",
            author: "Tervux"
        };
    }

    return cachedPackageMeta;
}

function getPrefix(config) {
    return config.prefix || "!";
}

function trimText(text = "", max = 300) {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function resolveTargetJid(m, args = []) {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo
        || m.message?.imageMessage?.contextInfo
        || m.message?.videoMessage?.contextInfo
        || {};

    const quotedParticipant = contextInfo.participant;
    const mentioned = contextInfo.mentionedJid?.[0];
    const numericArg = args[0]?.replace(/\D/g, "");

    if (quotedParticipant) return quotedParticipant;
    if (mentioned) return mentioned;
    if (numericArg) return `${numericArg}@s.whatsapp.net`;

    return m.key.participant || m.key.remoteJid;
}

function inferDeviceFromMessageId(messageId = "") {
    if (!messageId) return "Unknown";
    if (messageId.startsWith("BAE5")) return "Android";
    if (messageId.startsWith("3A")) return "iPhone / iOS";
    if (messageId.startsWith("3EB0")) return "WhatsApp Web / Multi-Device";
    return "Unknown / Multi-Device";
}

export const time = async (sock) => {
    const timezone = "Africa/Dar_es_Salaam";
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(now);
    const currentTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(now);

    return `╔══════════════════════════════════╗
║      🕒 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕋𝕀𝕄𝔼* 🕒        ║
╚══════════════════════════════════╝

📅 *Date:* ${date}
⏰ *Time:* ${currentTime}
🌍 *Timezone:* ${timezone} (EAT)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Live server time from Tervux Bot_`;
};

export const runtime = async () => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    return `╔══════════════════════════════════╗
║    ⏱️ *𝕋𝔼ℝ𝕍𝕌𝕏 ℝ𝕌ℕ𝕋𝕀𝕄𝔼* ⏱️      ║
╚══════════════════════════════════╝

🟢 *Status:* Online
⏳ *Uptime:* ${days}d ${hours}h ${minutes}m ${seconds}s
🧠 *Node.js:* ${process.version}
🖥️ *Platform:* ${process.platform}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Bot runtime checked successfully._`;
};

export const repo = async () => {
    const pkg = await getPackageMeta();

    return `╔══════════════════════════════════╗
║      📦 *𝕋𝔼ℝ𝕍𝕌𝕏 ℝ𝔼ℙ𝕆* 📦        ║
╚══════════════════════════════════╝

• *Project:* ${pkg.name || "tervux-whatsapp-bot"}
• *Version:* ${pkg.version || "unknown"}
• *Author:* ${pkg.author || "Tervux"}
• *GitHub:* https://github.com/JonniTech
• *Company:* https://www.tervux.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Use this repo info to follow updates._`;
};

export const calculate = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const expression = args.join("");

    if (!expression) {
        return `╔══════════════════════════════════╗
║   🔢 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝔸𝕃ℂ𝕌𝕃𝔸𝕋𝔼* 🔢    ║
╚══════════════════════════════════╝

📝 *Usage:* ${p}calculate 25 * (8 + 2)
💡 *Shortcut:* ${p}calc 25 * (8 + 2)`;
    }

    if (/[^-+/*().0-9 ]/g.test(expression)) {
        return `❌ Invalid characters detected. Use only numbers and *+ - / ( )*.`;
    }

    try {
        const result = new Function(`return ${expression}`)();
        return `🔢 *Calculate*\n\n📥 ${expression}\n📤 *${result}*`;
    } catch (error) {
        return `❌ Calculation error. Please check your expression and try again.`;
    }
};

export const qrcode = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const text = args.join(" ");

    if (!text) {
        return `╔══════════════════════════════════╗
║      📱 *ℚℝℂ𝕆𝔻𝔼 𝕄𝔸𝕂𝔼ℝ* 📱      ║
╚══════════════════════════════════╝

📝 *Usage:* ${p}qrcode <text or url>
💡 *Shortcut:* ${p}qr <text or url>`;
    }

    return {
        image: {
            url: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`
        },
        caption: `📱 *QR Code Generated*\n\n📝 *Data:* ${trimText(text, 120)}`
    };
};

export const tinyurl = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const targetUrl = args[0];

    if (!targetUrl) {
        return `╔══════════════════════════════════╗
║      🔗 *𝕋𝕀ℕ𝕐𝕌ℝ𝕃* 🔗            ║
╚══════════════════════════════════╝

📝 *Usage:* ${p}tinyurl https://example.com/very/long/link`;
    }

    try {
        const { data } = await axios.get("https://tinyurl.com/api-create.php", {
            params: { url: targetUrl },
            timeout: 10000
        });

        if (!String(data).startsWith("http")) {
            return `❌ Failed to shorten that link. Please make sure the URL is valid.`;
        }

        return `╔══════════════════════════════════╗
║      🔗 *𝕋𝕀ℕ𝕐𝕌ℝ𝕃* 🔗            ║
╚══════════════════════════════════╝

📥 *Original:* ${trimText(targetUrl, 150)}
📤 *Short URL:* ${data}`;
    } catch (error) {
        return `❌ TinyURL failed: ${error.message}`;
    }
};

export const getabout = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const targetJid = resolveTargetJid(m, args);

    if (!targetJid) {
        return `📝 *Usage:* ${p}getabout <number>\n💡 You can also reply to someone's message or mention them.`;
    }

    try {
        const statusInfo = await sock.fetchStatus(targetJid).catch(() => null);
        const statusText = statusInfo?.status || "No about/status found";
        const setAt = statusInfo?.setAt ? new Date(statusInfo.setAt).toLocaleString("en-GB") : "Unknown";

        return `╔══════════════════════════════════╗
║     📝 *𝔾𝔼𝕋 𝔸𝔹𝕆𝕌𝕋* 📝           ║
╚══════════════════════════════════╝

👤 *Number:* ${targetJid.split("@")[0]}
💬 *About:* ${statusText}
🕒 *Last Updated:* ${setAt}`;
    } catch (error) {
        return `❌ Could not fetch about/status for that user.`;
    }
};

export const say = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const text = args.join(" ");

    if (!text) {
        return `📝 *Usage:* ${p}say <message>`;
    }

    return text;
};

export const device = async (sock, m) => {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo
        || m.message?.imageMessage?.contextInfo
        || m.message?.videoMessage?.contextInfo
        || {};
    const targetMessageId = contextInfo.stanzaId || m.key.id || "";
    const targetParticipant = contextInfo.participant || m.key.participant || m.key.remoteJid;
    const inferredDevice = inferDeviceFromMessageId(targetMessageId);

    return `╔══════════════════════════════════╗
║       📱 *𝔻𝔼𝕍𝕀ℂ𝔼 𝕀ℕ𝔽𝕆* 📱       ║
╚══════════════════════════════════╝

👤 *Target:* ${targetParticipant?.split("@")[0] || "Unknown"}
🆔 *Message ID:* ${targetMessageId || "Unavailable"}
🔎 *Detected Device:* ${inferredDevice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Device detection is best-effort and based on WhatsApp message patterns._`;
};

async function searchWithSerpApi(query) {
    const { data } = await axios.get("https://serpapi.com/search.json", {
        params: {
            engine: "google",
            q: query,
            api_key: SERPAPI_KEY,
            num: 5
        },
        timeout: 12000
    });

    const organic = data.organic_results || [];
    return organic.slice(0, 5).map((item) => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link
    }));
}

async function searchWithDuckDuckGo(query) {
    const { data } = await axios.get("https://api.duckduckgo.com/", {
        params: {
            q: query,
            format: "json",
            no_html: 1,
            no_redirect: 1
        },
        timeout: 12000
    });

    const results = [];

    if (data.AbstractText) {
        results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            url: data.AbstractURL || "https://duckduckgo.com"
        });
    }

    for (const topic of data.RelatedTopics || []) {
        if (results.length >= 5) break;

        if (topic.Text && topic.FirstURL) {
            results.push({
                title: topic.Text.split(" - ")[0] || query,
                snippet: topic.Text,
                url: topic.FirstURL
            });
            continue;
        }

        for (const nested of topic.Topics || []) {
            if (results.length >= 5) break;
            if (!nested.Text || !nested.FirstURL) continue;
            results.push({
                title: nested.Text.split(" - ")[0] || query,
                snippet: nested.Text,
                url: nested.FirstURL
            });
        }
    }

    return results;
}

export const browse = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = getPrefix(config);
    const query = args.join(" ");

    if (!query) {
        return `╔══════════════════════════════════╗
║      🌐 *𝔹ℝ𝕆𝕎𝕊𝔼* 🌐             ║
╚══════════════════════════════════╝

📝 *Usage:* ${p}browse <search query>
📌 *Example:* ${p}browse latest Node.js features`;
    }

    try {
        const results = SERPAPI_KEY
            ? await searchWithSerpApi(query)
            : await searchWithDuckDuckGo(query);

        if (!results.length) {
            return `❌ No search results found for "*${query}*".`;
        }

        const lines = results.map((item, index) => {
            return `${index + 1}. *${trimText(item.title || query, 70)}*\n${trimText(item.snippet || "No description available.", 140)}\n🔗 ${item.url}`;
        });

        const sourceLabel = SERPAPI_KEY ? "SerpAPI" : "DuckDuckGo";

        return `╔══════════════════════════════════╗
║      🌐 *𝔹ℝ𝕆𝕎𝕊𝔼* 🌐             ║
╚══════════════════════════════════╝

🔎 *Query:* ${query}
🧭 *Source:* ${sourceLabel}

${lines.join("\n\n")}`;
    } catch (error) {
        return `❌ Browse search failed: ${error.message}`;
    }
};
