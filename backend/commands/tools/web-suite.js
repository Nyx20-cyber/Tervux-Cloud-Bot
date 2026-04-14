import axios from "axios";
import ytSearch from "yt-search";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { getCachedConfig } from "../../services/configService.js";

function getQuotedMessage(m) {
    return m.message?.extendedTextMessage?.contextInfo?.quotedMessage
        || m.message?.imageMessage?.contextInfo?.quotedMessage
        || m.message?.videoMessage?.contextInfo?.quotedMessage
        || null;
}

async function downloadQuotedBuffer(sock, quoted) {
    return downloadMediaMessage(
        { message: quoted },
        "buffer",
        {},
        { reuploadRequest: sock.updateMediaMessage }
    );
}

function normalizeUrl(input = "") {
    if (!input) return "";
    if (/^https?:\/\//i.test(input)) return input;
    return `https://${input}`;
}

function randomDigits(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

function luhnCheckDigit(number) {
    const digits = number.split("").map(Number).reverse();
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
        let digit = digits[i];
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return String((10 - (sum % 10)) % 10);
}

function buildCard(prefix, totalLength = 16) {
    const bodyLength = totalLength - prefix.length - 1;
    const body = randomDigits(bodyLength);
    const partial = `${prefix}${body}`;
    return `${partial}${luhnCheckDigit(partial)}`;
}

function parseVcfContacts(rawText = "") {
    const cards = rawText.split(/END:VCARD/i).map((chunk) => chunk.trim()).filter(Boolean);
    return cards.map((card) => {
        const nameMatch = card.match(/FN:(.+)/i);
        const telMatches = [...card.matchAll(/TEL[^:]*:(.+)/gi)];
        return {
            name: nameMatch?.[1]?.trim() || "Unknown",
            phones: telMatches.map((m) => m[1].replace(/[^\d+]/g, "").trim()).filter(Boolean)
        };
    }).filter((item) => item.phones.length);
}

function buildVcf(contacts = []) {
    return contacts.map((contact, index) => {
        const lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${contact.name || `Contact ${index + 1}`}`
        ];

        for (const phone of contact.phones || []) {
            lines.push(`TEL;TYPE=CELL:${phone}`);
        }

        lines.push("END:VCARD");
        return lines.join("\n");
    }).join("\n");
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

export const download = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args[0] || "";

    if (!input) {
        return `📝 *Usage:* ${p}download <direct url or YouTube link>`;
    }

    if (/youtu\.?be/i.test(input)) {
        const { video } = await import("../media/video.js");
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

    const archiveUrl = (() => {
        const githubMatch = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
        if (githubMatch) {
            const owner = githubMatch[1];
            const repo = githubMatch[2].replace(/\.git$/, "");
            return `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
        }

        const gitlabMatch = repoUrl.match(/^https?:\/\/gitlab\.com\/([^/]+)\/([^/#?]+)/i);
        if (gitlabMatch) {
            const owner = gitlabMatch[1];
            const repo = gitlabMatch[2].replace(/\.git$/, "");
            return `https://gitlab.com/${owner}/${repo}/-/archive/master/${repo}-master.zip`;
        }

        return "";
    })();

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
    const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
        || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
        || "";

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
        return `📝 *Usage:* ${p}videodoc <video url>`;
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

export const ssweb = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const url = normalizeUrl(args[0] || "");

    if (!url) {
        return `📝 *Usage:* ${p}ssweb <url>\n📌 Example: ${p}ssweb openai.com`;
    }

    return {
        image: {
            url: `https://image.thum.io/get/width/1280/crop/900/noanimate/${encodeURIComponent(url)}`
        },
        caption: `🌐 *Website Screenshot*\n\n🔗 ${url}`
    };
};

export const sswebpc = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const url = normalizeUrl(args[0] || "");

    if (!url) {
        return `📝 *Usage:* ${p}sswebpc <url>\n📌 Example: ${p}sswebpc openai.com`;
    }

    return {
        image: {
            url: `https://image.thum.io/get/width/1600/crop/1000/noanimate/${encodeURIComponent(url)}`
        },
        caption: `🖥️ *Desktop Website Screenshot*\n\n🔗 ${url}`
    };
};

export const sswebtab = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const url = normalizeUrl(args[0] || "");

    if (!url) {
        return `📝 *Usage:* ${p}sswebtab <url>\n📌 Example: ${p}sswebtab openai.com`;
    }

    return {
        image: {
            url: `https://image.thum.io/get/width/900/crop/1200/noanimate/${encodeURIComponent(url)}`
        },
        caption: `📱 *Tablet Website Screenshot*\n\n🔗 ${url}`
    };
};

export const tourl = async (sock, m) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted) {
        return `Reply to an image, video, audio, or document with *${p}tourl*.`;
    }

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        const form = new FormData();
        form.append("file", new Blob([buffer]), "tervux-upload.bin");

        const response = await fetch("https://0x0.st", {
            method: "POST",
            body: form
        });

        const url = (await response.text()).trim();
        if (!/^https?:\/\//i.test(url)) {
            return `❌ Failed to upload media and create a URL.`;
        }

        return `╔══════════════════════════════════╗
║        🔗 *𝕋𝕆 𝕌ℝ𝕃* 🔗            ║
╚══════════════════════════════════╝

📤 *Uploaded URL:* ${url}`;
    } catch (error) {
        return `❌ Upload failed: ${error.message}`;
    }
};

export const take = async (sock, m, args) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const packname = args[0] || "Tervux Pack";
    const author = args.slice(1).join(" ") || "tervux.com";

    if (!quoted?.stickerMessage) {
        return `Reply to a sticker with *${p}take <packname> <author>* to re-pack it.`;
    }

    try {
        const buffer = await downloadQuotedBuffer(sock, quoted);
        await sock.sendMessage(m.key.remoteJid, {
            sticker: buffer,
            mimetype: "image/webp",
            stickerMetadata: {
                packname,
                author
            }
        }, { quoted: m });
        return null;
    } catch (error) {
        return `❌ Failed to take sticker: ${error.message}`;
    }
};

export const emojimix = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const first = args[0];
    const second = args[1];

    if (!first || !second) {
        return `📝 *Usage:* ${p}emojimix 😀 😂`;
    }

    return `╔══════════════════════════════════╗
║      😄 *𝔼𝕄𝕆𝕁𝕀 𝕄𝕀𝕏* 😄          ║
╚══════════════════════════════════╝

*Mix:* ${first} + ${second}
*Result:* ${first}${second}

💡 Emoji Kitchen-style mixes vary by platform, so this command returns a compatible mixed display.`;
};

export const vcc = async (sock, m, args) => {
    const type = (args[0] || "visa").toLowerCase();
    const prefixes = {
        visa: "4",
        mastercard: "5",
        amex: "34"
    };
    const lengths = {
        visa: 16,
        mastercard: 16,
        amex: 15
    };

    const prefix = prefixes[type] || prefixes.visa;
    const length = lengths[type] || 16;
    const card = buildCard(prefix, length);
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const year = String((new Date().getFullYear() + 2 + Math.floor(Math.random() * 5))).slice(-2);
    const cvv = randomDigits(type === "amex" ? 4 : 3);

    return `╔══════════════════════════════════╗
║          💳 *𝕍ℂℂ* 💳             ║
╚══════════════════════════════════╝

*Type:* ${type.toUpperCase()}
*Number:* \`${card}\`
*Expiry:* ${month}/${year}
*CVV:* ${cvv}

⚠️ _Generated for testing/demo use only._`;
};

export const yts = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}yts <search query>\n📌 Example: ${p}yts alan walker faded`;
    }

    try {
        const result = await ytSearch(query);
        const videos = result.videos.slice(0, 5);

        if (!videos.length) {
            return `❌ No YouTube search results found for "*${query}*".`;
        }

        const lines = videos.map((video, index) => `${index + 1}. *${video.title}*\n⏱️ ${video.timestamp} | 👀 ${video.views?.toLocaleString?.() || video.views}\n🔗 ${video.url}`);

        return `╔══════════════════════════════════╗
║      ▶️ *𝕐𝕆𝕌𝕋𝕌𝔹𝔼 𝕊𝔼𝔸ℝℂℍ* ▶️      ║
╚══════════════════════════════════╝

🔎 *Query:* ${query}

${lines.join("\n\n")}`;
    } catch (error) {
        return `❌ YouTube search failed: ${error.message}`;
    }
};

export const gsmarena = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `📝 *Usage:* ${p}gsmarena <phone model>\n📌 Example: ${p}gsmarena Samsung Galaxy S24`;
    }

    try {
        const searchUrl = `https://www.gsmarena.com/res.php3?sSearch=${encodeURIComponent(query)}`;
        const { data: searchHtml } = await axios.get(searchUrl, { timeout: 15000 });
        const match = searchHtml.match(/<a href="([^"]+)"[^>]*><img[^>]*><strong>([^<]+)<\/strong>/i)
            || searchHtml.match(/<a href="([^"]+)"><span>([^<]+)<\/span>/i);

        if (!match) {
            return `❌ No GSMArena result found for "*${query}*".`;
        }

        const phonePath = match[1];
        const phoneUrl = phonePath.startsWith("http") ? phonePath : `https://www.gsmarena.com/${phonePath}`;
        const { data: phoneHtml } = await axios.get(phoneUrl, { timeout: 15000 });

        const title = (phoneHtml.match(/<h1[^>]*class="specs-phone-name-title"[^>]*>([^<]+)</i)?.[1] || match[2] || query).trim();
        const display = phoneHtml.match(/<td[^>]*data-spec="displaysize-hl"[^>]*>([^<]+)</i)?.[1]?.trim() || "N/A";
        const chipset = phoneHtml.match(/<td[^>]*data-spec="chipset-hl"[^>]*>([^<]+)</i)?.[1]?.trim() || "N/A";
        const memory = phoneHtml.match(/<td[^>]*data-spec="internalmemory"[^>]*>([^<]+)</i)?.[1]?.trim() || "N/A";
        const camera = phoneHtml.match(/<td[^>]*data-spec="cam1modules"[^>]*>([^<]+)</i)?.[1]?.trim() || "N/A";
        const battery = phoneHtml.match(/<td[^>]*data-spec="batdescription1"[^>]*>([^<]+)</i)?.[1]?.trim() || "N/A";

        return `╔══════════════════════════════════╗
║        📱 *𝔾𝕊𝕄𝔸ℝ𝔼ℕ𝔸* 📱          ║
╚══════════════════════════════════╝

*Device:* ${title}
*Display:* ${display}
*Chipset:* ${chipset}
*Memory:* ${memory}
*Camera:* ${camera}
*Battery:* ${battery}
🔗 ${phoneUrl}`;
    } catch (error) {
        return `❌ GSMArena lookup failed: ${error.message}`;
    }
};

export const filtervcf = async (sock, m, args) => {
    const quoted = getQuotedMessage(m);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (!quoted?.documentMessage) {
        return `Reply to a *.vcf* document with *${p}filtervcf [prefix]* to filter contacts.`;
    }

    try {
        const prefix = args[0] || "";
        const buffer = await downloadQuotedBuffer(sock, quoted);
        const rawText = buffer.toString("utf8");
        const contacts = parseVcfContacts(rawText);

        const filtered = contacts
            .map((contact) => ({
                ...contact,
                phones: contact.phones.filter((phone) => !prefix || phone.startsWith(prefix.replace(/[^\d+]/g, "")))
            }))
            .filter((contact) => contact.phones.length);

        if (!filtered.length) {
            return `❌ No matching contacts found in that VCF file.`;
        }

        const vcf = buildVcf(filtered);
        await sock.sendMessage(m.key.remoteJid, {
            document: Buffer.from(vcf, "utf8"),
            mimetype: "text/vcard",
            fileName: `filtered-${Date.now()}.vcf`
        }, { quoted: m });

        return `✅ Filtered ${filtered.length} contacts from the VCF file.`;
    } catch (error) {
        return `❌ VCF filtering failed: ${error.message}`;
    }
};
