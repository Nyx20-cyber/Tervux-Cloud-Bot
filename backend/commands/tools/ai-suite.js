import OpenAI from "openai";
import { formatMarkdown } from "../../utils/markdownToWhatsApp.js";
import { getCachedConfig } from "../../services/configService.js";
import { AI_API_BASE_URL, AI_API_KEY } from "../../env.js";

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

async function runAiMode(sock, m, args, options) {
    if (!client) {
        return `❌ *${options.title} is currently unavailable.* The AI API key is not configured.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const directInput = args.join(" ").trim();
    const quotedInput = getQuotedText(m).trim();
    const input = directInput || quotedInput;

    if (!input) {
        return `╔══════════════════════════════════╗
║   ${options.banner}   ║
╚══════════════════════════════════╝

${options.usageText || `*Usage:* ${p}${options.command} <text>`}

💡 _You can also reply to a message with_ *${p}${options.command}*`;
    }

    const chatJid = m.key.remoteJid;
    await sock.sendMessage(chatJid, {
        text: options.waitText || "🤖 _Working on it..._"
    });

    try {
        const completion = await client.chat.completions.create({
            model: "glm-4.7-flash",
            messages: [
                {
                    role: "system",
                    content: `${options.systemPrompt}

Keep the response clear and WhatsApp-friendly.
Prefer concise formatting.
Stay under 2500 characters unless absolutely necessary.
Use standard Markdown where useful.`
                },
                {
                    role: "user",
                    content: input
                }
            ]
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (!reply) {
            return `❌ *${options.title} returned no response.* Please try again.`;
        }

        const formatted = formatMarkdown(reply);
        const trimmed = formatted.length > 3000
            ? `${formatted.slice(0, 3000)}\n\n_...response trimmed for WhatsApp_`
            : formatted;

        return `╔══════════════════════════════════╗
║   ${options.banner}   ║
╚══════════════════════════════════╝

${options.includeInput === false ? "" : `📥 *Input:* ${input}\n\n`}
${trimmed}`;
    } catch (error) {
        console.error(`${options.command} error:`, error.message);
        return `❌ *${options.title} failed:* ${error.message || "Something went wrong"}`;
    }
}

export const analyze = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "analyze",
    title: "Analyze",
    banner: "🧠 *𝔸ℕ𝔸𝕃𝕐ℤ𝔼* 🧠",
    usageText: `*Usage:* ${(await getCachedConfig(sock.sessionId)).prefix || "!"}analyze <text, problem, or idea>`,
    waitText: "🧠 _Analyzing your input..._",
    systemPrompt: "You are an expert analyst. Break down problems, identify patterns, highlight risks, and give practical conclusions."
});

export const blackbox = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "blackbox",
    title: "Blackbox",
    banner: "📦 *𝔹𝕃𝔸ℂ𝕂𝔹𝕆𝕏* 📦",
    waitText: "📦 _Inspecting like a black-box debugger..._",
    systemPrompt: "You are a black-box debugging assistant. Infer likely causes from symptoms, list probable issues, and suggest actionable next steps."
});

export const code = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "code",
    title: "Code",
    banner: "💻 *ℂ𝕆𝔻𝔼* 💻",
    waitText: "💻 _Writing code..._",
    systemPrompt: "You are a senior software engineer. Provide clean code, short explanations, and practical implementation guidance. Prefer complete snippets when useful."
});

export const deepseek = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "deepseek",
    title: "Deepseek",
    banner: "🔍 *𝔻𝔼𝔼ℙ𝕊𝔼𝔼𝕂* 🔍",
    waitText: "🔍 _Digging deeper into the request..._",
    systemPrompt: "You are a deep reasoning assistant. Think carefully, compare options, expose assumptions, and provide a strong final answer."
});

export const gemini = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "gemini",
    title: "Gemini",
    banner: "✨ *𝔾𝔼𝕄𝕀ℕ𝕀* ✨",
    waitText: "✨ _Generating a polished answer..._",
    systemPrompt: "You are a creative and polished assistant. Respond clearly, elegantly, and helpfully with balanced detail."
});

export const generate = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "generate",
    title: "Generate",
    banner: "⚡ *𝔾𝔼ℕ𝔼ℝ𝔸𝕋𝔼* ⚡",
    waitText: "⚡ _Generating content..._",
    systemPrompt: "You generate useful content from prompts, including ideas, drafts, outlines, captions, names, and structured text."
});

export const gpt = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "gpt",
    title: "GPT",
    banner: "🤖 *𝔾ℙ𝕋* 🤖",
    waitText: "🤖 _Thinking..._",
    systemPrompt: "You are a helpful general-purpose assistant. Answer clearly, directly, and accurately."
});

export const programming = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "programming",
    title: "Programming",
    banner: "👨‍💻 *ℙℝ𝕆𝔾ℝ𝔸𝕄𝕄𝕀ℕ𝔾* 👨‍💻",
    waitText: "👨‍💻 _Solving your programming request..._",
    systemPrompt: "You are a programming tutor and engineer. Help debug, explain errors, design functions, and write production-minded code."
});

export const recipe = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "recipe",
    title: "Recipe",
    banner: "🍲 *ℝ𝔼ℂ𝕀ℙ𝔼* 🍲",
    waitText: "🍲 _Preparing a recipe..._",
    systemPrompt: "You are a chef assistant. Create practical recipes with ingredients, steps, timing, and simple substitutions."
});

export const summarize = async (sock, m, args) => runAiMode(sock, m, args, {
    command: "summarize",
    title: "Summarize",
    banner: "📝 *𝕊𝕌𝕄𝕄𝔸ℝ𝕀ℤ𝔼* 📝",
    waitText: "📝 _Summarizing the content..._",
    systemPrompt: "You summarize text clearly. Preserve the key points, remove repetition, and present the result in a short readable form."
});
