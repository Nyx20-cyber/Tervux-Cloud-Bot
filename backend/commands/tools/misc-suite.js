import axios from "axios";
import OpenAI from "openai";
import { getCachedConfig } from "../../services/configService.js";
import { formatMarkdown } from "../../utils/markdownToWhatsApp.js";
import { AI_API_BASE_URL, AI_API_KEY, OMDB_API_KEY } from "../../env.js";
import { ping } from "../general/ping.js";
import { quote } from "../general/quote.js";
import { joke } from "../fun/joke.js";
import { meme } from "../media/meme.js";
import { define } from "./define.js";
import { translate } from "./translate.js";

const client = AI_API_KEY
    ? new OpenAI({
        apiKey: AI_API_KEY,
        baseURL: AI_API_BASE_URL
    })
    : null;

function getQuotedText(m) {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo
        || m.message?.imageMessage?.contextInfo
        || m.message?.videoMessage?.contextInfo
        || {};
    const quoted = contextInfo.quotedMessage;

    if (!quoted) return "";

    return quoted.conversation
        || quoted.extendedTextMessage?.text
        || quoted.imageMessage?.caption
        || quoted.videoMessage?.caption
        || "";
}

async function runPromptCommand(sock, m, args, options) {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const input = args.join(" ").trim() || getQuotedText(m).trim();

    if (!input) {
        return `╔══════════════════════════════════╗
║   ${options.banner}   ║
╚══════════════════════════════════╝

*Usage:* ${p}${options.command} ${options.usage}

💡 _You can also reply to a message with_ *${p}${options.command}*`;
    }

    if (!client) {
        return options.fallback(input);
    }

    await sock.sendMessage(m.key.remoteJid, {
        text: options.waitText
    });

    try {
        const completion = await client.chat.completions.create({
            model: "glm-4.7-flash",
            messages: [
                {
                    role: "system",
                    content: `${options.systemPrompt}

Keep the answer concise, readable, and under 2200 characters unless necessary.
Use standard Markdown when helpful.`
                },
                {
                    role: "user",
                    content: input
                }
            ]
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (!reply) {
            return `❌ *${options.title} returned no response.*`;
        }

        return `╔══════════════════════════════════╗
║   ${options.banner}   ║
╚══════════════════════════════════╝

${formatMarkdown(reply)}`;
    } catch (error) {
        console.error(`${options.command} error:`, error.message);
        return options.fallback(input);
    }
}

export const ping2 = async (sock, m, args, ctx = {}) => {
    const base = await ping(sock, m, args, ctx);
    return `${base}

🔁 *Mode:* Ping 2
📡 *Connection:* Stable`;
};

export const jokes = async (sock, m, args) => joke(sock, m, args);
export const quotes = async (sock, m, args) => quote(sock, m, args);
export const memes = async (sock, m, args) => meme(sock, m, args);
export const define2 = async (sock, m, args) => define(sock, m, args);
export const translate2 = async (sock, m, args) => translate(sock, m, args);

export const story = async (sock, m, args) => runPromptCommand(sock, m, args, {
    command: "story",
    title: "Story",
    banner: "📖 *𝕊𝕋𝕆ℝ𝕐* 📖",
    usage: "<idea, theme, or characters>",
    waitText: "📖 _Writing your story..._",
    systemPrompt: "You are a creative storyteller. Write engaging, coherent short stories with a clear beginning, middle, and end.",
    fallback: (input) => `╔══════════════════════════════════╗
║   📖 *𝕊𝕋𝕆ℝ𝕐* 📖                  ║
╚══════════════════════════════════╝

Once upon a time, ${input}, and what began as a simple moment slowly turned into an unforgettable adventure. Along the way, unexpected challenges appeared, courage was tested, and hope kept everything moving forward.

In the end, the journey changed everyone involved, leaving behind a lesson worth remembering: even small beginnings can lead to remarkable endings.`
});

export const teach = async (sock, m, args) => runPromptCommand(sock, m, args, {
    command: "teach",
    title: "Teach",
    banner: "🎓 *𝕋𝔼𝔸ℂℍ* 🎓",
    usage: "<topic>",
    waitText: "🎓 _Preparing a simple lesson..._",
    systemPrompt: "You are a patient teacher. Explain the topic in simple terms, then give an example and a quick recap.",
    fallback: (input) => `╔══════════════════════════════════╗
║   🎓 *𝕋𝔼𝔸ℂℍ* 🎓                  ║
╚══════════════════════════════════╝

*Topic:* ${input}

1. *Simple explanation:* ${input} can be understood by focusing on what it is, how it works, and why it matters.
2. *Example:* Try relating ${input} to a real-life situation or one practical use case.
3. *Quick recap:* Learn the meaning first, then the process, then practice with examples.`
});

export const truthdetector = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const text = args.join(" ").trim() || getQuotedText(m).trim();

    if (!text) {
        return `╔══════════════════════════════════╗
║  🕵️ *𝕋ℝ𝕌𝕋ℍ 𝔻𝔼𝕋𝔼ℂ𝕋𝕆ℝ* 🕵️       ║
╚══════════════════════════════════╝

*Usage:* ${p}truthdetector <statement>

💡 _You can also reply to a message with_ *${p}truthdetector*`;
    }

    const score = 35 + (text.length * 7 + text.split(/\s+/).length * 11) % 61;
    let verdict = "Suspicious";
    if (score >= 75) verdict = "Likely True";
    else if (score >= 55) verdict = "Unclear";

    return `╔══════════════════════════════════╗
║  🕵️ *𝕋ℝ𝕌𝕋ℍ 𝔻𝔼𝕋𝔼ℂ𝕋𝕆ℝ* 🕵️       ║
╚══════════════════════════════════╝

📥 *Statement:* ${text}
📊 *Truth Score:* ${score}%
🔎 *Verdict:* ${verdict}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Fun command only. Not a real fact-check engine._`;
};

export const imdb = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const query = args.join(" ").trim();

    if (!query) {
        return `╔══════════════════════════════════╗
║      🎞️ *𝕀𝕄𝔻𝔹* 🎞️              ║
╚══════════════════════════════════╝

*Usage:* ${p}imdb <movie or series name>
*Example:* ${p}imdb Interstellar`;
    }

    try {
        const apiKey = OMDB_API_KEY || "trilogy";
        const { data } = await axios.get("https://www.omdbapi.com/", {
            params: {
                apikey: apiKey,
                t: query,
                plot: "short"
            },
            timeout: 15000
        });

        if (data?.Response !== "True") {
            return `❌ No IMDb result found for "*${query}*".`;
        }

        const caption = `╔══════════════════════════════════╗
║      🎞️ *𝕀𝕄𝔻𝔹 𝕀ℕ𝔽𝕆* 🎞️         ║
╚══════════════════════════════════╝

🎬 *Title:* ${data.Title}
📺 *Type:* ${data.Type}
📅 *Year:* ${data.Year}
⏱️ *Runtime:* ${data.Runtime}
🎭 *Genre:* ${data.Genre}
⭐ *IMDb Rating:* ${data.imdbRating}
🗳️ *Votes:* ${data.imdbVotes}
🎬 *Director:* ${data.Director}
👥 *Actors:* ${data.Actors}

📝 *Plot:* ${data.Plot}`;

        if (data.Poster && data.Poster !== "N/A") {
            try {
                const poster = await axios.get(data.Poster, {
                    responseType: "arraybuffer",
                    timeout: 10000
                });

                return {
                    image: Buffer.from(poster.data),
                    caption
                };
            } catch {
                return caption;
            }
        }

        return caption;
    } catch (error) {
        return `❌ IMDb lookup failed: ${error.message}`;
    }
};
