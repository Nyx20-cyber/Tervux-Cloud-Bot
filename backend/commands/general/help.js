import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getCachedConfig } from "../../services/configService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELP_LOGO_PATH = path.join(__dirname, "../../assets/tervux-logo.png");
let cachedHelpLogoBuffer = null;
let warnedMissingHelpLogo = false;

async function getHelpLogoBuffer() {
  if (cachedHelpLogoBuffer) return cachedHelpLogoBuffer;
  if (!existsSync(HELP_LOGO_PATH)) {
    if (!warnedMissingHelpLogo) {
      console.warn(`[Help] Missing logo file: ${HELP_LOGO_PATH}`);
      warnedMissingHelpLogo = true;
    }
    return null;
  }

  cachedHelpLogoBuffer = await readFile(HELP_LOGO_PATH);
  return cachedHelpLogoBuffer;
}

export const help = async (sock, m, args, ctx = {}) => {
  const config = ctx.config || await getCachedConfig(sock.sessionId);
  const runtime = ctx.runtime || null;
  const p = config.prefix || "!";
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(now);
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
  const ownerName = sock?.user?.name || runtime?.name || config.name || "Bot Owner";
  const ownerNumber = String(runtime?.ownerNumber || config.ownerNumber || config.phone || "").replace(/\D/g, "");
  const totalCommands = Number(ctx.totalCommands || 0);
  const botStatus = runtime?.status ? String(runtime.status).toUpperCase() : "ACTIVE";
  const deploymentState = runtime?.isDeployed === false ? "Not Deployed" : "Deployed";

  const caption = `╭───『 🤖 *𝕋𝔼ℝ𝕍𝕌𝕏 ℂ𝕃𝕆𝕌𝔻 𝔹𝕆𝕋* 』───╮
│
│ ✨ *Prefix:* ${p}
│ 👑 *Owner:* ${ownerName}
│ 📱 *Owner Number:* ${ownerNumber ? `+${ownerNumber}` : "Private"}
│ 📅 *Date:* ${currentDate}
│ ⏰ *Time:* ${currentTime} EAT
│ 📦 *Status:* ${botStatus} • ${deploymentState}
│ 🧠 *Total Commands:* ${totalCommands || "Many"}
│ 🔐 *Mode:* Private Owner Bot
╰──────────────────────────────╯

╭───『 🎮 *𝔽𝕌ℕ ℤ𝕆ℕ𝔼* 』───╮
│ 💘 ➾ *${p}ship* @user1 @user2
│ ✨ ➾ *${p}fancy* <text>
│ 😂 ➾ *${p}joke*
│ 😂 ➾ *${p}jokes*
│ 🧠 ➾ *${p}fact*
│ 😇 ➾ *${p}truth*
│ 😈 ➾ *${p}dare*
│ 🎲 ➾ *${p}truthordare*
│ 🎱 ➾ *${p}8ball* <question>
│ 💘 ➾ *${p}pickup*
│ 🌟 ➾ *${p}compliment*
│ 🔥 ➾ *${p}roast*
│ 🧩 ➾ *${p}riddle*
│ 💻 ➾ *${p}hack* <@user>
│ 🧠 ➾ *${p}iqtest* <@user>
│ 💥 ➾ *${p}slap* <@user>
│ 🏆 ➾ *${p}top10* <trait>
│ 💀 ➾ *${p}suicide*
╰──────────────────────────────╯

╭───『 💕 *𝕃𝕆𝕍𝔼 & ℝ𝔼𝕃𝔸𝕋𝕀𝕆ℕ𝕊* 』───╮
│ 💘 ➾ *${p}flirt*
│ 💌 ➾ *${p}lovemsg*
│ 💌 ➾ *${p}loveletter* <name>
│ 🎯 ➾ *${p}crush* <stage>
│ 🌅 ➾ *${p}goodmorning* <name>
│ 🌙 ➾ *${p}goodnight* <name>
│ 💞 ➾ *${p}compatibility* A & B
│ 💑 ➾ *${p}dateidea* <type>
│ 💍 ➾ *${p}marry* <@user>
│ ✅ ➾ *${p}accept*
│ 💔 ➾ *${p}divorce*
╰──────────────────────────────╯

╭───『 🎭 *ℙℝ𝔸ℕ𝕂𝕊 & 𝕋ℝ𝕆𝕃𝕃* 』───╮
│ ☣️ ➾ *${p}virus*
│ 💀 ➾ *${p}crash*
│ 🟢 ➾ *${p}matrix*
│ 🕵️ ➾ *${p}detective* <@user>
│ 💣 ➾ *${p}spam*
│ 🤫 ➾ *${p}confess* <text>
│ ⭐ ➾ *${p}rate* <@user>
╰──────────────────────────────╯

╭───『 🎲 *𝔾𝔸𝕄𝔼𝕊* 』───╮
│ ✊ ➾ *${p}rps* <choice>
│ 🪙 ➾ *${p}coinflip*
│ 🎲 ➾ *${p}dice* <count>
│ 🧠 ➾ *${p}trivia*
╰──────────────────────────────╯

╭───『 ⚙️ *𝔾𝔼ℕ𝔼ℝ𝔸𝕃* 』───╮
│ 🏓 ➾ *${p}ping*
│ 📊 ➾ *${p}botstatus*
│ 📊 ➾ *${p}botstats*
│ 👑 ➾ *${p}owner*
│ 🚫 ➾ *${p}block* <@user>
│ ✅ ➾ *${p}unblock* <number>
│ ℹ️ ➾ *${p}help*
│ 💎 ➾ *${p}creator*
│ 💫 ➾ *${p}quote*
│ 💫 ➾ *${p}quotes*
│ 🏓 ➾ *${p}ping2*
│ 💬 ➾ *${p}feedback* <message>
│ 💳 ➾ *${p}billing* _(payment info)_
╰──────────────────────────────╯

╭───『 🎬 *𝕄𝔼𝔻𝕀𝔸* 』───╮
│ 🎵 ➾ *${p}play* <YouTube link / ID>
│ 🎵 ➾ *${p}song* <YouTube link / ID>
│ 🎵 ➾ *${p}song2* <YouTube link / ID>
│ 📹 ➾ *${p}video* <YouTube link / ID>
│ 🎬 ➾ *${p}movie* <movie name>
│ 🎞️ ➾ *${p}imdb* <movie name>
│ ⚽ ➾ *${p}sport* <team name>
│ 📰 ➾ *${p}news*
│ 😂 ➾ *${p}meme*
│ 😂 ➾ *${p}memes*
│ 🎤 ➾ *${p}lyrics* <song>
│ 🎧 ➾ *${p}shazam* _(reply to audio/video)_
│ 🔮 ➾ *${p}zodiac* <sign>
│ 🖼️ ➾ *${p}wallpaper* <theme>
│ 🌸 ➾ *${p}waifu* <category>
│ 👁️ ➾ *${p}vv* (reply to view once)
│ 👁️ ➾ *${p}vvp* (reply to view once to private)
│ 🔄 ➾ *${p}convert* <format>
│ 🎵 ➾ *${p}tomp3* _(reply to audio/video)_
│ 🎵 ➾ *${p}toaudio* _(reply to audio/video)_
│ 🎬 ➾ *${p}tovideo* <link / reply>
│ 🔊 ➾ *${p}volvideo* <percent> _(reply to video)_
╰──────────────────────────────╯

╭───『 🎵 *𝔸𝕌𝔻𝕀𝕆 𝔼𝔽𝔽𝔼ℂ𝕋𝕊* 』───╮
│ 🎸 ➾ *${p}bass* / *${p}treble* / *${p}fat*
│ ⚡ ➾ *${p}nightcore* / *${p}fast* / *${p}slow*
│ 🤖 ➾ *${p}robot* / *${p}deep* / *${p}pitch*
│ 💀 ➾ *${p}earrape* / *${p}blown* / *${p}cut*
│ 🌊 ➾ *${p}smooth* / *${p}low* / *${p}histo*
│ 🎹 ➾ *${p}avec* / *${p}black*
│ 🔁 ➾ *${p}reverse* / *${p}toptt* / *${p}volaudio*
╰──────────────────────────────╯

╭───『 👤 *𝕊𝕋𝔸𝕋𝕌𝕊* 』───╮
│ 🕵️ ➾ *${p}status* <@user/num>
│ 📝 ➾ *${p}setbio* <text>
│ ✏️ ➾ *${p}setname* <name>
╰──────────────────────────────╯

╭───『 🛠️ *𝕋𝕆𝕆𝕃𝕊* 』───╮
│ 🔢 ➾ *${p}calc* <expression>
│ 📱 ➾ *${p}qr* <text>
│ 🌐 ➾ *${p}translate* <text>
│ 🌐 ➾ *${p}translate2* <text>
│ 🌤️ ➾ *${p}weather* <city>
│ 📖 ➾ *${p}define* <word>
│ 📖 ➾ *${p}define2* <word>
│ ✨ ➾ *${p}aesthetic* <text>
│ 🔄 ➾ *${p}fliptext* <text>
│ 😄 ➾ *${p}emojimix* 😀 😂
│ 🖼️ ➾ *${p}sticker*
│ 🏷️ ➾ *${p}take* <packname> <author>
│ 🖼️ ➾ *${p}toimage* _(reply to sticker)_
│ 🐙 ➾ *${p}github* <user>
│ 📦 ➾ *${p}download* <url>
│ 📥 ➾ *${p}videodoc* <video url>
│ 📂 ➾ *${p}gitclone* <repo url>
│ ☁️ ➾ *${p}gdrive* <link>
│ 📦 ➾ *${p}mediafire* <link>
│ 🍎 ➾ *${p}itunes* <query>
│ 📱 ➾ *${p}apk* <app name>
│ 📌 ➾ *${p}pin* <query>
│ 🖼️ ➾ *${p}image* <query>
│ 📱 ➾ *${p}gsmarena* <phone model>
│ 🔐 ➾ *${p}password* <length>
│ 🔐 ➾ *${p}genpass* <length>
│ 📚 ➾ *${p}wiki* <topic>
│ 🔣 ➾ *${p}base64* encode/decode
│ 📇 ➾ *${p}filtervcf* <prefix>
│ 🕶️ ➾ *${p}obfuscate* <text>
│ 🌐 ➾ *${p}ip* <address>
│ 🤖 ➾ *${p}ai* <question>
│ 🧠 ➾ *${p}analyze* <text>
│ 📦 ➾ *${p}blackbox* <problem>
│ 💻 ➾ *${p}code* <task>
│ 🔍 ➾ *${p}deepseek* <question>
│ ✨ ➾ *${p}gemini* <prompt>
│ ⚡ ➾ *${p}generate* <prompt>
│ 🤖 ➾ *${p}gpt* <prompt>
│ 👨‍💻 ➾ *${p}programming* <task>
│ 🍲 ➾ *${p}recipe* <ingredients/idea>
│ 📝 ➾ *${p}summarize* <text>
│ 📖 ➾ *${p}story* <idea>
│ 🎓 ➾ *${p}teach* <topic>
│ 🕵️ ➾ *${p}truthdetector* <statement>
│ 📥 ➾ *${p}save* (reply/caption)
│ 👤 ➾ *${p}profiled* <@user>
│ 🌍 ➾ *${p}browse* <query>
│ 🔢 ➾ *${p}calculate* <expression>
│ 📱 ➾ *${p}qrcode* <text>
│ 🔗 ➾ *${p}tinyurl* <url>
│ 🔗 ➾ *${p}tourl* _(reply to media)_
│ 📟 ➾ *${p}device* (or reply)
│ 📸 ➾ *${p}getpp* <@user/num>
│ 📝 ➾ *${p}getabout* <@user/num>
│ 🗣️ ➾ *${p}say* <text>
│ 📄 ➾ *${p}texttopdf* <text>
│ 💳 ➾ *${p}vcc* <visa/mastercard/amex>
│ 🌐 ➾ *${p}ssweb* <url>
│ 🖥️ ➾ *${p}sswebpc* <url>
│ 📱 ➾ *${p}sswebtab* <url>
│ 📦 ➾ *${p}repo*
│ ⏱️ ➾ *${p}runtime*
│ 🕒 ➾ *${p}time*
│ 🤝 ➾ *${p}helpers*
│ ▶️ ➾ *${p}yts* <query>
╰──────────────────────────────╯

╭───『 ⚙️ *𝕊𝔼𝕋𝕋𝕀ℕ𝔾𝕊* 』───╮
│ 🔧 ➾ *${p}settings*
│ ✏️ ➾ *${p}prefix* <new>
│ 🌐 ➾ *${p}alwaysonline*
│ ❤️ ➾ *${p}autolikestatus* _(react to status)_
│ 👁️ ➾ *${p}autoviewstatus* _(view status only)_
│ 🛡️ ➾ *${p}antidelete* _(DMs only)_
│ 📵 ➾ *${p}anticall*
│ ✔️ ➾ *${p}autoread* _(mark messages as read)_
│ ⌨️ ➾ *${p}alwaystyping*
│ 🎙️ ➾ *${p}alwaysrecording*
╰──────────────────────────────╯

╭───『 📜 *ℝ𝔼𝕃𝕀𝔾𝕀𝕆ℕ* 』───╮
│ 📖 ➾ *${p}bible*
│ 🌙 ➾ *${p}quran*
│ ✨ ➾ *${p}verse*
╰──────────────────────────────╯

╭───『 👥 *𝔾ℝ𝕆𝕌ℙ 𝕄𝔸ℕ𝔸𝔾𝔼𝕄𝔼ℕ𝕋* 』───╮
│ 📢 ➾ *${p}hidetag* <msg>
│ 🏷️ ➾ *${p}tagall* <msg>
│ 📢 ➾ *${p}groupstatus* <msg>
│ 👑 ➾ *${p}admins*
│ 📊 ➾ *${p}groupinfo*
│ 🔗 ➾ *${p}grouplink* / *${p}revoke*
│ ➕ ➾ *${p}add* / *${p}kick*
│ ⬆️ ➾ *${p}promote* / *${p}demote*
│ 🔇 ➾ *${p}mute* / *${p}unmute*
│ ✏️ ➾ *${p}setgroupname* / *${p}setdesc*
│ 👑 ➾ *${p}tagadmins* <msg>
│ 📊 ➾ *${p}stats* _(activity rank)_
│ 👻 ➾ *${p}ghosts* _(silent users)_
│ 🔒 ➾ *${p}grouplock* <time>
╰──────────────────────────────╯

╭───『 🎉 *𝔾ℝ𝕆𝕌ℙ 𝔸𝕌𝕋𝕆𝕄𝔸𝕋𝕀𝕆ℕ* 』───╮
│ 👋 ➾ *${p}welcome* on/off
│ ✏️ ➾ *${p}setwelcome* <msg>
│ 🚪 ➾ *${p}goodbye* on/off
│ ✏️ ➾ *${p}setgoodbye* <msg>
│ 🔗 ➾ *${p}antilink* on/kick/off
│ 🎭 ➾ *${p}antisticker* on/kick/off
│ ⏱️ ➾ *${p}antispam* on/off
│ 📣 ➾ *${p}antitagall* on/off
│ 🛡️ ➾ *${p}antimention* on/off
│ 🎙️ ➾ *${p}antivoice* on/off
│ 🖼️ ➾ *${p}antiimage* on/off
│ 🎬 ➾ *${p}antivideo* on/off
│ 📄 ➾ *${p}antidocument* on/off
│ ↪️ ➾ *${p}antiforward* on/off
│ 📝 ➾ *${p}antilongtext* on/off
│ 📊 ➾ *${p}antipoll* on/off
│ 🚩 ➾ *${p}antifake* on/off
│ 🚫 ➾ *${p}badword* add/remove
│ 📸 ➾ *${p}autosticker* on/off
│ 🛡️ ➾ *${p}groupantidelete* on/off
│ 📊 ➾ *${p}poll* Q | A | B
│ ⚠️ ➾ *${p}warn* / *${p}resetwarn*
│ 👋 ➾ *${p}leave* / *${p}rejoin*
│ 🤖 ➾ *${p}bot* on/off
╰──────────────────────────────╯

`;

  const logoBuffer = await getHelpLogoBuffer();
  if (logoBuffer) {
    return {
      image: logoBuffer,
      caption,
      linkPreview: null
    };
  }

  return caption;
};
