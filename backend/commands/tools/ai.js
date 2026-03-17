import OpenAI from "openai";
import { formatMarkdown } from "../../utils/markdownToWhatsApp.js";
import { getCachedConfig } from "../../services/configService.js";

const client = new OpenAI({
    apiKey: "4e9fb363e4f2431cab69e20da6ac7047.PVKzsV6Vz9wjDiRZ",
    baseURL: "https://open.bigmodel.cn/api/paas/v4/"
});

export const ai = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const chatJid = m.key.remoteJid;
    const question = args.join(" ");

    if (!question) {
        return `╔══════════════════════════════════╗
║   🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 𝔸𝕀* 🤖                ║
╚══════════════════════════════════╝

This command lets you ask the bot questions and get an AI-generated answer.

*Usage:* ${p}ai <your question>

*Examples:*
• *${p}ai* What is the meaning of life?
• *${p}ai* Write a poem about love
• *${p}ai* Explain quantum physics simply
• *${p}ai* Help me with my homework

🧠 _Powered by Tervux AI_ ⚡`;
    }

    // Send typing indicator
    await sock.sendMessage(chatJid, {
        text: "🤖 _Thinking..._"
    });

    try {
        const completion = await client.chat.completions.create({
            model: "glm-4.7-flash",
            messages: [
                {
                    role: "system",
                    content: `You are Tervux AI, a helpful, friendly, and intelligent AI assistant built into a WhatsApp bot. You are created by Nyaganya Malima Nyaganya (aka Tervux). You answer questions clearly and concisely. Keep responses under 2000 characters for WhatsApp readability. Use emojis occasionally to be engaging. If asked about yourself, mention you are Tervux AI powered by advanced language models. Use standard Markdown for formatting (e.g., **bold** for importance, *italics* for emphasis, \`code\` for code snippets).`
                },
                {
                    role: "user",
                    content: question
                }
            ]
        });

        const reply = completion.choices[0]?.message?.content;

        if (!reply) {
            return `❌ *AI returned no response.* Try again!`;
        }

        // Format the reply for WhatsApp
        const formattedReply = formatMarkdown(reply);

        // Trim if extremely long
        const trimmed = formattedReply.length > 3000
            ? formattedReply.substring(0, 3000) + "\n\n_...response trimmed for WhatsApp_ ✂️"
            : formattedReply;

        return `╔══════════════════════════════════╗
║   🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 𝔸𝕀* 🤖                ║
╚══════════════════════════════════╝

❓ *You asked:* ${question}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${trimmed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 _Powered by Tervux AI_ ⚡`;

    } catch (err) {
        console.error("❌ AI Error:", err.message);

        if (err.message?.includes("timeout") || err.code === "ETIMEDOUT") {
            return `⏱️ *AI took too long to respond.* Try again with a simpler question!`;
        }

        return `❌ *Network Error:* ${err.message || "Something went wrong"}

💡 _Try again in a moment._`;
    }
};
