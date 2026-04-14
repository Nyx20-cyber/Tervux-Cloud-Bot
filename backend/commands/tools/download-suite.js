import axios from "axios";
import { getCachedConfig } from "../../services/configService.js";
import { video } from "../media/video.js";
import { save } from "./save.js";

function normalizeUrl(input = "") {
    if (!input) return "";
    if (/^https?:\/\//i.test(input)) return input;
    return `https://${input}`;
}

function extractGoogleDriveId(url = "") {
    return url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
        || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
        || "";
}

function buildArchiveUrl(url = "") {
    const githubMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (githubMatch) {
        const owner = githubMatch[1];
        const repo = githubMatch[2].replace(/\.git$/, "");
        return `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
    }

    const gitlabMatch = url.match(/^https?:\/\/gitlab\.com\/([^/]+)\/([^/#?]+)/i);
    if (gitlabMatch) {
        const owner = gitlabMatch[1];
        const repo = gitlabMatch[2].replace(/\.git$/, "");
        return `https://gitlab.com/${owner}/${repo}/-/archive/master/${repo}-master.zip`;
    }

    return "";
}

async function firstDuckDuckGoResult(query) {
    const { data } = await axios.get("https://duckduckgo.com/html/", {
        params: { q: query },
        timeout: 15000,
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
    });

    const match = data.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/i);
    if (!match?.[1]) return "";

    const candidate = match[1];
    try {
        const parsed = new URL(candidate, "https://duckduckgo.com");
        const uddg = parsed.searchParams.get("uddg");
        return uddg ? decodeURIComponent(uddg) : candidate;
    } catch {
        return candidate;
    }
}

async function socialSearch(commandLabel, site, input) {
    const raw = input.trim();
    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) return raw;

    const result = await firstDuckDuckGoResult(`site:${site} ${raw}`);
    if (result) return result;

    return `https://${site}`;
}

export const download = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args[0] || "";

    if (!input) {
        return `📝 *Usage:* ${p}download <direct url or YouTube link>`;
    }

    if (/youtu\.?be/i.test(input)) {
        return video(sock, m, args);
    }

    const url = normalizeUrl(input);

    try {
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 20000,
            maxContentLength: 15 * 1024 * 1024,
            maxBodyLength: 15 * 1024 * 1024
        });

        const fileName = url.split("/").pop()?.split("?")[0] || `download-${Date.now()}.bin`;
        await sock.sendMessage(m.key.remoteJid, {
            document: Buffer.from(response.data),
            mimetype: response.headers["content-type"] || "application/octet-stream",
            fileName
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Download failed: ${error.message}`;
    }
};

export const image = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}image <query>\n📌 Example: ${p}image lion`;
    }

    return {
        image: {
            url: `https://loremflickr.com/1080/1080/${encodeURIComponent(query)}?lock=${Date.now()}`
        },
        caption: `🖼️ *Image Result*\n\n🔎 Query: ${query}`
    };
};

export const gitclone = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const repoUrl = args[0];

    if (!repoUrl) {
        return `📝 *Usage:* ${p}gitclone <github/gitlab repo url>`;
    }

    const archiveUrl = buildArchiveUrl(repoUrl);
    if (!archiveUrl) {
        return `❌ Unsupported repository URL. Use a GitHub or GitLab repository link.`;
    }

    return `╔══════════════════════════════════╗
║      📦 *𝔾𝕀𝕋 ℂ𝕃𝕆ℕ𝔼* 📦          ║
╚══════════════════════════════════╝

🔗 *Repository:* ${repoUrl}
📥 *Archive:* ${archiveUrl}`;
};

export const gdrive = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const url = args[0] || "";
    const id = extractGoogleDriveId(url);

    if (!id) {
        return `📝 *Usage:* ${p}gdrive <google drive share link>`;
    }

    return `╔══════════════════════════════════╗
║       ☁️ *𝔾𝔻ℝ𝕀𝕍𝔼* ☁️             ║
╚══════════════════════════════════╝

📄 *File ID:* ${id}
🔗 *Preview:* https://drive.google.com/file/d/${id}/view
📥 *Direct:* https://drive.google.com/uc?export=download&id=${id}`;
};

export const mediafire = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args[0];

    if (!input) {
        return `📝 *Usage:* ${p}mediafire <link>`;
    }

    try {
        const url = normalizeUrl(input);
        const { data } = await axios.get(url, {
            timeout: 15000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const match = data.match(/https?:\/\/download[^"' ]+/i)
            || data.match(/<a[^>]+id="downloadButton"[^>]+href="([^"]+)"/i);
        const finalUrl = match?.[1] || match?.[0];

        if (!finalUrl) {
            return `❌ Could not extract a MediaFire download link.`;
        }

        return `📥 *MediaFire Direct Link:*\n${finalUrl}`;
    } catch (error) {
        return `❌ MediaFire lookup failed: ${error.message}`;
    }
};

export const itunes = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}itunes <artist, song, app, or album>`;
    }

    try {
        const { data } = await axios.get("https://itunes.apple.com/search", {
            params: {
                term: query,
                limit: 5
            },
            timeout: 15000
        });

        const results = data.results || [];
        if (!results.length) {
            return `❌ No iTunes results found for "*${query}*".`;
        }

        const lines = results.slice(0, 5).map((item, index) => `${index + 1}. *${item.trackName || item.collectionName || item.artistName}*\n👤 ${item.artistName || "Unknown"}\n📦 ${item.kind || item.wrapperType}\n🔗 ${item.trackViewUrl || item.collectionViewUrl || item.artistViewUrl}`);

        return `╔══════════════════════════════════╗
║       🍎 *𝕀𝕋𝕌ℕ𝔼𝕊* 🍎             ║
╚══════════════════════════════════╝

🔎 *Query:* ${query}

${lines.join("\n\n")}`;
    } catch (error) {
        return `❌ iTunes search failed: ${error.message}`;
    }
};

export const apk = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}apk <app name>`;
    }

    try {
        const result = await firstDuckDuckGoResult(`site:apkpure.com ${query}`);
        if (!result) {
            return `❌ No APK result found for "*${query}*".`;
        }

        return `📱 *APK Search Result*\n\n🔎 ${query}\n🔗 ${result}`;
    } catch (error) {
        return `❌ APK search failed: ${error.message}`;
    }
};

export const pin = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}pin <query>`;
    }

    try {
        const result = await firstDuckDuckGoResult(`site:pinterest.com/pin ${query}`);
        if (!result) {
            return `❌ No Pinterest result found for "*${query}*".`;
        }

        return `📌 *Pinterest Result*\n\n🔎 ${query}\n🔗 ${result}`;
    } catch (error) {
        return `❌ Pinterest search failed: ${error.message}`;
    }
};

export const videodoc = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args[0] || "";

    if (!input) {
        return `📝 *Usage:* ${p}videodoc <direct video url>`;
    }

    try {
        const url = normalizeUrl(input);
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 25000,
            maxContentLength: 20 * 1024 * 1024,
            maxBodyLength: 20 * 1024 * 1024
        });

        const fileName = url.split("/").pop()?.split("?")[0] || `video-${Date.now()}.mp4`;
        await sock.sendMessage(m.key.remoteJid, {
            document: Buffer.from(response.data),
            mimetype: response.headers["content-type"] || "video/mp4",
            fileName
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Video document download failed: ${error.message}`;
    }
};

export const facebook = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}facebook <link or search>`;
    }

    const url = await socialSearch("facebook", "facebook.com", input);
    return `📘 *Facebook Result:*\n${url}`;
};

export const instagram = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}instagram <link or search>`;
    }

    const url = await socialSearch("instagram", "instagram.com", input);
    return `📸 *Instagram Result:*\n${url}`;
};

export const twitter = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}twitter <link or search>`;
    }

    const url = await socialSearch("twitter", "x.com", input);
    return `🐦 *Twitter/X Result:*\n${url}`;
};

export const tiktok = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}tiktok <link or search>`;
    }

    const url = await socialSearch("tiktok", "tiktok.com", input);
    return `🎵 *TikTok Result:*\n${url}`;
};

export const tiktokaudio = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}tiktokaudio <link or search>`;
    }

    const url = await socialSearch("tiktokaudio", "tiktok.com", input);
    return `🎧 *TikTok Audio Result:*\n${url}`;
};

export const xvideo = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}xvideo <search>`;
    }

    const url = await socialSearch("xvideo", "xvideos.com", input);
    return `🔞 *XVideo Result:*\n${url}`;
};

export const telesticker = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim();

    if (!input) {
        return `📝 *Usage:* ${p}telesticker <pack link or name>`;
    }

    const url = await socialSearch("telesticker", "t.me/addstickers", input);
    return `🧩 *Telegram Sticker Pack:*\n${url}`;
};

export const savestatus = async (sock, m, args, ctx = {}) => {
    return save(sock, m, args, ctx);
};

export const pair = async (sock, m) => {
    return `╔══════════════════════════════════╗
║        🔗 *𝕡𝕒𝕚𝕣* 🔗               ║
╚══════════════════════════════════╝

Use the web dashboard to pair a device:
• Open the pairing page in your dashboard
• Scan the QR code with WhatsApp

If you need help, use the helpers command.`;
};

export const fetchgroups = async (sock) => {
    try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.values(groups || {}).slice(0, 30);

        if (!entries.length) {
            return "❌ No groups found for this session.";
        }

        const lines = entries.map((group, index) => `${index + 1}. *${group.subject}*\n🆔 ${group.id}`);

        return `╔══════════════════════════════════╗
║      👥 *𝔽𝔼𝕋ℂℍ 𝔾ℝ𝕆𝕌ℙ𝕊* 👥       ║
╚══════════════════════════════════╝

${lines.join("\n\n")}`;
    } catch (error) {
        return `❌ Failed to fetch groups: ${error.message}`;
    }
};
