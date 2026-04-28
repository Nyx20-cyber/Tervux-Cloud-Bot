/**
 * Group Commands - Comprehensive group management suite
 * Commands: hidetag, tagall, kick, add, promote, demote, mute, unmute, 
 *           groupinfo, grouplink, revoke, antilink, setwelcome, setgoodbye
 */

import { isAdmin, isBotAdmin, getGroupMetadata, getGroupParticipantContext } from "../../utils/groupUtils.js";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { getCachedConfig } from "../../services/configService.js";
import {
    loadGroupSettings,
    saveGroupSettings,
    saveInviteCode,
    getInviteCode,
    updateGroupName
} from "../../services/groupSettingsService.js";
import GroupMemberStats from "../../models/GroupMemberStats.js";

function buildProtectionGuide({ icon, title, status, commandLines, footer, examples = [] }) {
    const commandBlock = commandLines.map((line) => `• ${line}`).join("\n");
    const exampleBlock = examples.length
        ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Examples:*\n${examples.map((line) => `• ${line}`).join("\n")}\n`
        : "";

    return `╔══════════════════════════════════╗
║  ${icon} *${title}* ${icon}  ║
╚══════════════════════════════════╝

*Status:* ${status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
${commandBlock}${exampleBlock}
${footer}`;
}

async function ensureGroupProtectionAccess(sock, remoteJid, sender, featureName, { requireBotAdmin = true } = {}) {
    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isAdmin(sock, remoteJid, sender)) {
        return `⚠️ Only admins can manage ${featureName}.`;
    }

    if (requireBotAdmin && !await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to manage ${featureName}.`;
    }

    return null;
}

async function getCommandConfig(sock, ctx) {
    return ctx?.config || await getCachedConfig(sock.sessionId);
}

async function getCommandGroupContext(sock, m, ctx) {
    if (ctx?.getGroupContext) {
        const context = await ctx.getGroupContext();
        if (context) return context;
    }
    return getGroupParticipantContext(sock, m.key.remoteJid, m.key.participant || m.key.remoteJid);
}

async function getCommandGroupMetadata(sock, m, ctx) {
    const context = await getCommandGroupContext(sock, m, ctx);
    if (context?.metadata) return context.metadata;
    return getGroupMetadata(sock, m.key.remoteJid);
}

async function handleSimpleProtectionToggle({
    sock,
    m,
    args,
    settingKey,
    featureName,
    title,
    icon,
    footer,
    enableText,
    disableText,
    requireBotAdmin = true
}) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, featureName, { requireBotAdmin });
    if (accessError) return accessError;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        settings[settingKey] = { enabled: true };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `✅ *${title} Enabled* ✅\n\n${enableText}`;
    }

    if (action === "off") {
        settings[settingKey] = { enabled: false };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `❌ *${title} Disabled* ❌\n\n${disableText}`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return buildProtectionGuide({
        icon,
        title,
        status: settings[settingKey]?.enabled ? "✅ Enabled" : "❌ Disabled",
        commandLines: [
            `${p}${settingKey} on - Enable`,
            `${p}${settingKey} off - Disable`
        ],
        examples: [`${p}${settingKey} on`, `${p}${settingKey} off`],
        footer
    });
}

/**
 * !hidetag <message> - Tag all members without showing mentions (stealth tag)
 */
export async function hidetag(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `╔══════════════════════════════════╗
║  ⚠️ *𝔾ℝ𝕆𝕌ℙ 𝕆ℕ𝕃𝕐* ⚠️  ║
╚══════════════════════════════════╝

This command only works in groups.`;
    }

    const message = args.join(" ") || "📢 Attention everyone!";

    try {
        const metadata = await getCommandGroupMetadata(sock, m, ctx);
        const participants = metadata.participants.map(p => p.id);

        await sock.sendMessage(remoteJid, {
            text: message,
            mentions: participants
        });

        return null; // Message already sent
    } catch (err) {
        return `❌ Failed to hidetag: ${err.message}`;
    }
}

/**
 * !tagall - Tag all members with visible list
 */
export async function tagall(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const customMessage = args.join(" ") || "";

    try {
        const metadata = await getCommandGroupMetadata(sock, m, ctx);
        const participants = metadata.participants;

        let tagList = `╔══════════════════════════════════╗
║  📢 *𝕋𝔸𝔾 𝔸𝕃𝕃 𝕄𝔼𝕄𝔹𝔼ℝ𝕊* 📢  ║
╚══════════════════════════════════╝

${customMessage ? `💬 *Message:* ${customMessage}\n\n` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 *Members (${participants.length}):*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        participants.forEach((p, i) => {
            const number = p.id.split("@")[0];
            tagList += `${i + 1}. @${number}\n`;
        });

        await sock.sendMessage(remoteJid, {
            text: tagList,
            mentions: participants.map(p => p.id)
        });

        return null;
    } catch (err) {
        return `❌ Failed: ${err.message}`;
    }
}

/**
 * !kick @user - Remove a member from the group
 */
export async function kick(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to remove members.`;
    }

    // Get mentioned user or quoted message sender
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned || quoted;

    if (!target) {
        const config = await getCommandConfig(sock, ctx);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  🦶 *𝕂𝕀ℂ𝕂 𝕄𝔼𝕄𝔹𝔼ℝ* 🦶  ║
╚══════════════════════════════════╝

This command removes a member from the group.

*Usage:* ${p}kick @user
*Alt:* Reply to a message with ${p}kick`;
    }

    try {
        await sock.groupParticipantsUpdate(remoteJid, [target], "remove");
        const number = target.split("@")[0];
        return `✅ Successfully removed @${number} from the group.`;
    } catch (err) {
        return `❌ Failed to kick: ${err.message}`;
    }
}

/**
 * !add <number> - Add a member to the group
 */
export async function add(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to add members.`;
    }

    if (!args[0]) {
        const config = await getCommandConfig(sock, ctx);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  ➕ *𝔸𝔻𝔻 𝕄𝔼𝕄𝔹𝔼ℝ* ➕  ║
╚══════════════════════════════════╝

This command adds a member to the group using their number.

*Usage:* ${p}add 255712345678
Include country code without + or spaces.`;
    }

    const number = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    try {
        const result = await sock.groupParticipantsUpdate(remoteJid, [number], "add");

        if (result[0]?.status === "403") {
            return `⚠️ Cannot add this number. Their privacy settings may prevent it.`;
        }

        return `✅ Successfully added ${args[0]} to the group!`;
    } catch (err) {
        return `❌ Failed to add: ${err.message}`;
    }
}

/**
 * !promote @user - Make someone an admin
 */
export async function promote(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to promote members.`;
    }

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned || quoted;

    if (!target) {
        const config = await getCommandConfig(sock, ctx);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  👑 *ℙℝ𝕆𝕄𝕆𝕋𝔼 𝕋𝕆 𝔸𝔻𝕄𝕀ℕ* 👑  ║
╚══════════════════════════════════╝

This command gives admin rights to a group member.

*Usage:* ${p}promote @user
*Alt:* Reply to a message with ${p}promote`;
    }

    try {
        await sock.groupParticipantsUpdate(remoteJid, [target], "promote");
        const number = target.split("@")[0];
        return `👑 @${number} is now an admin!`;
    } catch (err) {
        return `❌ Failed to promote: ${err.message}`;
    }
}

/**
 * !demote @user - Remove admin status
 */
export async function demote(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to demote members.`;
    }

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned || quoted;

    if (!target) {
        const config = await getCommandConfig(sock, ctx);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  📉 *𝔻𝔼𝕄𝕆𝕋𝔼 𝔸𝔻𝕄𝕀ℕ* 📉  ║
╚══════════════════════════════════╝

This command removes admin rights from a group member.

*Usage:* ${p}demote @user
*Alt:* Reply to a message with ${p}demote`;
    }

    try {
        await sock.groupParticipantsUpdate(remoteJid, [target], "demote");
        const number = target.split("@")[0];
        return `📉 @${number} is no longer an admin.`;
    } catch (err) {
        return `❌ Failed to demote: ${err.message}`;
    }
}

/**
 * !mute - Close group (only admins can send)
 */
export async function mute(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to mute the group.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    try {
        await sock.groupSettingUpdate(remoteJid, "announcement");
        return `╔══════════════════════════════════╗
║  🔇 *𝔾ℝ𝕆𝕌ℙ 𝕄𝕌𝕋𝔼𝔻* 🔇  ║
╚══════════════════════════════════╝

🔒 *Group is now closed.*
Only admins can send messages.

Use *${p}unmute* to reopen.`;
    } catch (err) {
        return `❌ Failed to mute: ${err.message}`;
    }
}

/**
 * !unmute - Open group (everyone can send)
 */
export async function unmute(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to unmute the group.`;
    }

    try {
        await sock.groupSettingUpdate(remoteJid, "not_announcement");
        return `╔══════════════════════════════════╗
║  🔊 *𝔾ℝ𝕆𝕌ℙ 𝕌ℕ𝕄𝕌𝕋𝔼𝔻* 🔊  ║
╚══════════════════════════════════╝

Everyone can now send messages.`;
    } catch (err) {
        return `❌ Failed to unmute: ${err.message}`;
    }
}

/**
 * !groupinfo - Display group information
 */
export async function groupinfo(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    try {
        const metadata = await getCommandGroupMetadata(sock, m, ctx);
        const admins = metadata.participants.filter(p => p.admin);
        const superAdmins = admins.filter(p => p.admin === "superadmin");
        const regularAdmins = admins.filter(p => p.admin === "admin");

        const createdDate = new Date(metadata.creation * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });

        return `╔══════════════════════════════════╗
║  📊 *𝔾ℝ𝕆𝕌ℙ 𝕀ℕ𝔽𝕆* 📊  ║
╚══════════════════════════════════╝

📛 *Name:* ${metadata.subject}
🆔 *ID:* ${remoteJid}
📝 *Description:*
${metadata.desc || "_No description_"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 *Total Members:* ${metadata.participants.length}
👑 *Super Admins:* ${superAdmins.length}
🛡️ *Admins:* ${regularAdmins.length}
📅 *Created:* ${createdDate}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    } catch (err) {
        return `❌ Failed to get info: ${err.message}`;
    }
}

/**
 * !grouplink - Get group invite link
 */
export async function grouplink(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to get the invite link.`;
    }

    try {
        const code = await sock.groupInviteCode(remoteJid);
        return `╔══════════════════════════════════╗
║  🔗 *𝔾ℝ𝕆𝕌ℙ 𝕃𝕀ℕ𝕂* 🔗  ║
╚══════════════════════════════════╝

https://chat.whatsapp.com/${code}

Share this link to invite people!`;
    } catch (err) {
        return `❌ Failed to get link: ${err.message}`;
    }
}

/**
 * !revoke - Reset/revoke group invite link
 */
export async function revoke(sock, m, args, ctx) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const groupContext = await getCommandGroupContext(sock, m, ctx);
    if (!groupContext?.botIsAdmin) {
        return `⚠️ Bot must be an admin to revoke the link.`;
    }

    try {
        await sock.groupRevokeInvite(remoteJid);
        const newCode = await sock.groupInviteCode(remoteJid);
        return `╔══════════════════════════════════╗
║  🔄 *𝕃𝕀ℕ𝕂 ℝ𝔼𝕍𝕆𝕂𝔼𝔻* 🔄  ║
╚══════════════════════════════════╝

Old link has been disabled.

*New link:*
https://chat.whatsapp.com/${newCode}`;
    } catch (err) {
        return `❌ Failed to revoke: ${err.message}`;
    }
}

/**
 * !leave - Make the bot leave the group
 */
export async function leave(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    // Try to save invite code before leaving
    if (await isBotAdmin(sock, remoteJid)) {
        try {
            const code = await sock.groupInviteCode(remoteJid);
            const metadata = await sock.groupMetadata(remoteJid);
            saveInviteCode(remoteJid, code);
            updateGroupName(remoteJid, metadata.subject);
            console.log(`📝 Saved invite code for ${metadata.subject} before leaving.`);
        } catch (e) {
            console.error("Failed to save invite code:", e.message);
        }
    }

    try {
        const sender = m.key.participant || m.key.remoteJid;
        const botJid = sock.user?.id;

        // If the message is fromMe, it means the user's personal account is leaving
        if (m.key.fromMe) {
            const config = await getCachedConfig(sock.sessionId);
            const p = config.prefix || "!";
            await sock.sendMessage(remoteJid, {
                text: `⚠️ *Warning:* You are using your personal WhatsApp account as the bot. 
Running ${p}leave will make *YOU* leave this group.

If you just want me to stop responding, use:
*${p}bot off*

If you really want to leave, type:
*${p}leave confirm*`
            });

            if (args[0] !== "confirm") return null;
        }

        await sock.sendMessage(remoteJid, {
            text: `╔══════════════════════════════════╗
║  👋 *𝔾𝕆𝕆𝔻𝔹𝕐𝔼* 👋  ║
╚══════════════════════════════════╝

Tervux Bot is leaving this group.
Thanks for having me! 

🔗 github.com/JonniTech/Tervux-WhatsApp-Bot`
        });

        await sock.groupLeave(remoteJid);
        return null;
    } catch (err) {
        return `❌ Failed to leave: ${err.message}`;
    }
}

/**
 * !admins - List all group admins
 */
export async function admins(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    try {
        const metadata = await sock.groupMetadata(remoteJid);
        const adminList = metadata.participants.filter(p => p.admin);

        let output = `╔══════════════════════════════════╗
║  👑 *𝔾ℝ𝕆𝕌ℙ 𝔸𝔻𝕄𝕀ℕ𝕊* 👑  ║
╚══════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        adminList.forEach((admin, i) => {
            const number = admin.id.split("@")[0];
            const role = admin.admin === "superadmin" ? "👑 Owner" : "🛡️ Admin";
            output += `${i + 1}. @${number} - ${role}\n`;
        });

        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Total:* ${adminList.length} admins`;

        await sock.sendMessage(remoteJid, {
            text: output,
            mentions: adminList.map(a => a.id)
        });

        return null;
    } catch (err) {
        return `❌ Failed: ${err.message}`;
    }
}

/**
 * !setname <name> - Change group name
 */
export async function setgroupname(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to change the group name.`;
    }

    const newName = args.join(" ");
    if (!newName) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `This command changes the group name.\n\n*Usage:* ${p}setgroupname <new name>`;
    }

    try {
        await sock.groupUpdateSubject(remoteJid, newName);
        return `✅ Group name changed to: *${newName}*`;
    } catch (err) {
        return `❌ Failed: ${err.message}`;
    }
}

/**
 * !setdesc <description> - Change group description
 */
export async function setdesc(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to change the description.`;
    }

    const newDesc = args.join(" ");
    if (!newDesc) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `This command changes the group description.\n\n*Usage:* ${p}setdesc <new description>`;
    }

    try {
        await sock.groupUpdateDescription(remoteJid, newDesc);
        return `✅ Group description updated!`;
    } catch (err) {
        return `❌ Failed: ${err.message}`;
    }
}

// ═══════════════════════════════════════════════════════════════
// WELCOME & GOODBYE SYSTEM
// ═══════════════════════════════════════════════════════════════

/**
 * !welcome on/off - Toggle welcome messages
 */
export async function welcome(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "welcome messages", { requireBotAdmin: false });
    if (accessError) return accessError;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        settings.welcome.enabled = true;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `✅ *Welcome Enabled!* New members will now be greeted.
💡 Use *${p}setwelcome <message>* to change it.`;
    }

    if (action === "off") {
        settings.welcome.enabled = false;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ❌ *𝕎𝔼𝕃ℂ𝕆𝕄𝔼 𝔻𝕀𝕊𝔸𝔹𝕃𝔼𝔻* ❌  ║
╚══════════════════════════════════╝

Welcome messages have been turned off.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return `╔══════════════════════════════════╗
║  👋 *𝕎𝔼𝕃ℂ𝕆𝕄𝔼 𝕊𝕐𝕊𝕋𝔼𝕄* 👋  ║
╚══════════════════════════════════╝

*Status:* ${settings.welcome.enabled ? "✅ Enabled" : "❌ Disabled"}

*Current message:*
${settings.welcome.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Default:* Welcome stays OFF until an admin enables it manually.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
• ${p}welcome on - Enable
• ${p}welcome off - Disable
• ${p}setwelcome <msg> - Set message

💡 Use *@user* for member mention`;
}

/**
 * !setwelcome <message> - Set custom welcome message
 */
export async function setwelcome(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "welcome messages", { requireBotAdmin: false });
    if (accessError) return accessError;

    const message = args.join(" ");
    if (!message) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  ✏️ *𝕊𝔼𝕋 𝕎𝔼𝕃ℂ𝕆𝕄𝔼* ✏️  ║
╚══════════════════════════════════╝

This command sets the custom message sent to new members when they join.

*Usage:* ${p}setwelcome <your message>

*Placeholders:*
• @user - Member's mention
• {group} - Group name
• {count} - Member count

*Example:*
${p}setwelcome Welcome @user to our family! 🎉
You are member #{count} in {group}!`;
    }

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    settings.welcome.message = message;
    await saveGroupSettings(sock.sessionId, remoteJid, settings);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    return `✅ Welcome message updated!

*Status:* ${settings.welcome.enabled === true ? "✅ Enabled" : "❌ Still disabled"}

*Preview:*
${message.replace("@user", "@newmember")}

${settings.welcome.enabled === true
            ? ""
            : `\n💡 Welcome messages are still OFF. Use *${p}welcome on* when you are ready to send them.`}`;
}

/**
 * !goodbye on/off - Toggle goodbye messages
 */
export async function goodbye(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "goodbye messages", { requireBotAdmin: false });
    if (accessError) return accessError;
    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        settings.goodbye.enabled = true;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  ✅ *𝔾𝕆𝕆𝔻𝔹𝕐𝔼 𝔼ℕ𝔸𝔹𝕃𝔼𝔻* ✅  ║
╚══════════════════════════════════╝

A farewell message will be sent when members leave!

*Current message:*
${settings.goodbye.message}

💡 Use *${p}setgoodbye <message>* to change it.`;
    }

    if (action === "off") {
        settings.goodbye.enabled = false;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ❌ *𝔾𝕆𝕆𝔻𝔹𝕐𝔼 𝔻𝕀𝕊𝔸𝔹𝕃𝔼𝔻* ❌  ║
╚══════════════════════════════════╝

Goodbye messages have been turned off.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return `╔══════════════════════════════════╗
║  👋 *𝔾𝕆𝕆𝔻𝔹𝕐𝔼 𝕊𝕐𝕊𝕋𝔼𝕄* 👋  ║
╚══════════════════════════════════╝

*Status:* ${settings.goodbye.enabled ? "✅ Enabled" : "❌ Disabled"}

*Current message:*
${settings.goodbye.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
• ${p}goodbye on - Enable
• ${p}goodbye off - Disable
• ${p}setgoodbye <msg> - Set message

💡 Use *@user* for member mention`;
}

/**
 * !setgoodbye <message> - Set custom goodbye message
 */
export async function setgoodbye(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "goodbye messages", { requireBotAdmin: false });
    if (accessError) return accessError;

    const message = args.join(" ");
    if (!message) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  ✏️ *𝕊𝔼𝕋 𝔾𝕆𝕆𝔻𝔹𝕐𝔼* ✏️  ║
╚══════════════════════════════════╝

This command sets the custom message sent when members leave the group.

*Usage:* ${p}setgoodbye <your message>

*Placeholders:*
• @user - Member's name
• {group} - Group name
• {count} - Member count after leave
• {desc} - Group description

*Example:*
${p}setgoodbye Goodbye @user! 👋
We'll miss you in {group}!`;
    }

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    settings.goodbye.message = message;
    await saveGroupSettings(sock.sessionId, remoteJid, settings);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    return `✅ Goodbye message updated!

*Status:* ${settings.goodbye.enabled === true ? "✅ Enabled" : "❌ Still disabled"}

*Preview:*
${message.replace("@user", "@leavingmember")}

${settings.goodbye.enabled === true
            ? ""
            : `\n💡 Goodbye messages are still OFF. Use *${p}goodbye on* when you are ready to send them.`}`;
}

/**
 * !antilink on/off/kick/warn - Toggle anti-link protection
 */
export async function antilink(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "antilink");
    if (accessError) return accessError;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on" || action === "warn" || action === "delete" || action === "kick") {
        const mode = (action === "on" || action === "warn") ? "warn" : action;
        settings.antilink.enabled = true;
        settings.antilink.action = mode;
        
        // Try to fetch and save invite code so we can whitelist this group's link automatically
        if (await isBotAdmin(sock, remoteJid)) {
            try {
                const code = await sock.groupInviteCode(remoteJid);
                await saveInviteCode(sock.sessionId, remoteJid, code);
                console.log(`✅ Saved invite code for antilink whitelisting in ${remoteJid}`);
            } catch (e) {
                console.warn(`⚠️ Could not fetch invite code for ${remoteJid}:`, e.message);
            }
        }

        await saveGroupSettings(sock.sessionId, remoteJid, settings);

        const titles = {
            warn: "𝔸ℕ𝕋𝕀𝕃𝕀ℕ𝕂 - 𝕎𝔸ℝℕ",
            delete: "𝔸ℕ𝕋𝕀𝕃𝕀ℕ𝕂 - 𝔻𝔼𝕃𝔼𝕋𝔼",
            kick: "𝔸ℕ𝕋𝕀𝕃𝕀ℕ𝕂 - 𝕂𝕀ℂ𝕂"
        };

        const texts = {
            warn: "Links will be deleted and user will be warned.",
            delete: "Links will be deleted automatically.",
            kick: "Links will be deleted and user will be removed!"
        };

        return `╔══════════════════════════════════╗
║  🔗 *${titles[mode]}* 🔗  ║
╚══════════════════════════════════╝

Anti-link is now *ON* (${mode} mode)

${texts[mode]}`;
    }

    if (action === "off") {
        settings.antilink.enabled = false;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ❌ *𝔸ℕ𝕋𝕀𝕃𝕀ℕ𝕂 𝔻𝕀𝕊𝔸𝔹𝕃𝔼𝔻* ❌  ║
╚══════════════════════════════════╝

Members can now share links freely.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return `╔══════════════════════════════════╗
║  🔗 *𝔸ℕ𝕋𝕀𝕃𝕀ℕ𝕂 𝕊𝕐𝕊𝕋𝔼𝕄* 🔗  ║
╚══════════════════════════════════╝

*Status:* ${settings.antilink.enabled ? `✅ Enabled (${settings.antilink.action})` : "❌ Disabled"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
• ${p}antilink on - Enable (warn mode)
• ${p}antilink delete - Enable (delete only)
• ${p}antilink kick - Enable (kick mode)
• ${p}antilink off - Disable

🛡️ Protects group from spam links!`;
}

/**
 * !antisticker on/off/kick/warn - Toggle anti-sticker protection
 */
export async function antisticker(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isAdmin(sock, remoteJid, m.key.participant || m.key.remoteJid)) {
        return `⚠️ Only admins can manage antisticker.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to manage antisticker.`;
    }

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on" || action === "warn") {
        settings.antisticker = { enabled: true, action: "warn" };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  🎭 *𝔸ℕ𝕋𝕀𝕊𝕋𝕀ℂ𝕂𝔼ℝ - 𝕎𝔸ℝℕ* 🎭  ║
╚══════════════════════════════════╝

Anti-sticker is now *ON* (Warn mode)

Stickers will be deleted and the sender will be warned.`;
    }

    if (action === "kick" || action === "remove") {
        settings.antisticker = { enabled: true, action: "kick" };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  🎭 *𝔸ℕ𝕋𝕀𝕊𝕋𝕀ℂ𝕂𝔼ℝ - 𝕂𝕀ℂ𝕂* 🎭  ║
╚══════════════════════════════════╝

Anti-sticker is now *ON* (Kick mode)

Stickers will be deleted and the sender will be removed.`;
    }

    if (action === "off") {
        settings.antisticker = { enabled: false, action: settings.antisticker?.action || "warn" };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ❌ *𝔸ℕ𝕋𝕀𝕊𝕋𝕀ℂ𝕂𝔼ℝ 𝔻𝕀𝕊𝔸𝔹𝕃𝔼𝔻* ❌  ║
╚══════════════════════════════════╝

Members can now send stickers freely.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const currentMode = settings.antisticker?.enabled
        ? settings.antisticker.action === "kick"
            ? "✅ Enabled (Kick mode)"
            : "✅ Enabled (Warn mode)"
        : "❌ Disabled";

    return `╔══════════════════════════════════╗
║  🎭 *𝔸ℕ𝕋𝕀𝕊𝕋𝕀ℂ𝕂𝔼ℝ 𝕊𝕐𝕊𝕋𝔼𝕄* 🎭  ║
╚══════════════════════════════════╝

*Status:* ${currentMode}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
• ${p}antisticker on - Enable (warn mode)
• ${p}antisticker warn - Same as on
• ${p}antisticker kick - Enable (remove mode)
• ${p}antisticker remove - Same as kick
• ${p}antisticker off - Disable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Examples:*
• ${p}antisticker on
• ${p}antisticker kick
• ${p}antisticker off

🛡️ Blocks stickers from non-admin members.
⚠️ Bot must be admin for delete/remove actions.`;
}

/**
 * !antispam on/off [max] [window] - Toggle anti-spam protection
 */
export async function antispam(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "antispam");
    if (accessError) return accessError;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        const parsedMaxMessages = Number.parseInt(args[1] || "", 10);
        const parsedWindow = Number.parseInt(args[2] || "", 10);
        settings.antispam = {
            enabled: true,
            maxMessages: Number.isFinite(parsedMaxMessages) && parsedMaxMessages >= 3 ? parsedMaxMessages : (settings.antispam?.maxMessages || 5),
            timeWindow: Number.isFinite(parsedWindow) && parsedWindow >= 3 ? parsedWindow : (settings.antispam?.timeWindow || 10)
        };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `🛡️ *ANTISPAM ENABLED* 🛡️\n\nFlood messages from non-admin members will now be deleted.\n\n*Limit:* ${settings.antispam.maxMessages} messages in ${settings.antispam.timeWindow}s`;
    }

    if (action === "off") {
        settings.antispam = {
            enabled: false,
            maxMessages: settings.antispam?.maxMessages || 5,
            timeWindow: settings.antispam?.timeWindow || 10
        };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `❌ *ANTISPAM DISABLED* ❌\n\nMembers can now send rapid messages freely.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return buildProtectionGuide({
        icon: "⏱️",
        title: "ANTISPAM SYSTEM",
        status: settings.antispam?.enabled
            ? `✅ Enabled (${settings.antispam.maxMessages} msgs / ${settings.antispam.timeWindow}s)`
            : "❌ Disabled",
        commandLines: [
            `${p}antispam on - Enable with current limits`,
            `${p}antispam on 5 10 - Enable with custom limits`,
            `${p}antispam off - Disable`
        ],
        examples: [`${p}antispam on`, `${p}antispam on 6 12`, `${p}antispam off`],
        footer: "🛡️ Deletes flood messages from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antitagall on/off - Toggle anti-tag-all protection
 */
export async function antitagall(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antitagall",
        featureName: "antitagall",
        title: "ANTITAGALL",
        icon: "📣",
        enableText: "Mass mention attempts like @all / @everyone from non-admins will now be deleted.",
        disableText: "Members can now use mass mentions freely.",
        footer: "🛡️ Blocks @all, @everyone, and mass mention spam from non-admins.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antivoice on/off - Toggle anti-voice-note protection
 */
export async function antivoice(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antivoice",
        featureName: "antivoice",
        title: "ANTIVOICE",
        icon: "🎙️",
        enableText: "Voice notes from non-admin members will now be deleted automatically.",
        disableText: "Members can now send voice notes freely.",
        footer: "🛡️ Blocks voice notes from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antiimage on/off - Toggle anti-image protection
 */
export async function antiimage(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antiimage",
        featureName: "antiimage",
        title: "ANTIIMAGE",
        icon: "🖼️",
        enableText: "Images from non-admin members will now be deleted automatically.",
        disableText: "Members can now send images freely.",
        footer: "🛡️ Blocks images from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antivideo on/off - Toggle anti-video protection
 */
export async function antivideo(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antivideo",
        featureName: "antivideo",
        title: "ANTIVIDEO",
        icon: "🎬",
        enableText: "Videos from non-admin members will now be deleted automatically.",
        disableText: "Members can now send videos freely.",
        footer: "🛡️ Blocks videos from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antidocument on/off - Toggle anti-document protection
 */
export async function antidocument(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antidocument",
        featureName: "antidocument",
        title: "ANTIDOCUMENT",
        icon: "📄",
        enableText: "Documents from non-admin members will now be deleted automatically.",
        disableText: "Members can now send documents freely.",
        footer: "🛡️ Blocks document sharing from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antiforward on/off - Toggle anti-forward protection
 */
export async function antiforward(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antiforward",
        featureName: "antiforward",
        title: "ANTIFORWARD",
        icon: "↪️",
        enableText: "Forwarded messages from non-admin members will now be deleted automatically.",
        disableText: "Members can now send forwarded messages freely.",
        footer: "🛡️ Blocks forwarded message spam from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antilongtext on/off [maxLength] - Toggle anti-long-text protection
 */
export async function antilongtext(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const accessError = await ensureGroupProtectionAccess(sock, remoteJid, sender, "antilongtext");
    if (accessError) return accessError;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        const parsedMaxLength = Number.parseInt(args[1] || "", 10);
        settings.antilongtext = {
            enabled: true,
            maxLength: Number.isFinite(parsedMaxLength) && parsedMaxLength >= 150
                ? parsedMaxLength
                : (settings.antilongtext?.maxLength || 600)
        };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `📝 *ANTILONGTEXT ENABLED* 📝\n\nVery long messages from non-admin members will now be deleted.\n\n*Limit:* ${settings.antilongtext.maxLength} characters`;
    }

    if (action === "off") {
        settings.antilongtext = {
            enabled: false,
            maxLength: settings.antilongtext?.maxLength || 600
        };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `❌ *ANTILONGTEXT DISABLED* ❌\n\nMembers can now send very long messages freely.`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return buildProtectionGuide({
        icon: "📝",
        title: "ANTILONGTEXT",
        status: settings.antilongtext?.enabled
            ? `✅ Enabled (${settings.antilongtext.maxLength} chars)`
            : "❌ Disabled",
        commandLines: [
            `${p}antilongtext on - Enable with current limit`,
            `${p}antilongtext on 600 - Enable with custom limit`,
            `${p}antilongtext off - Disable`
        ],
        examples: [`${p}antilongtext on`, `${p}antilongtext on 500`, `${p}antilongtext off`],
        footer: "🛡️ Deletes overly long messages from non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antipoll on/off - Toggle anti-poll protection
 */
export async function antipoll(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antipoll",
        featureName: "antipoll",
        title: "ANTIPOLL",
        icon: "📊",
        enableText: "Polls from non-admin members will now be deleted automatically.",
        disableText: "Members can now create polls freely.",
        footer: "🛡️ Blocks poll creation by non-admin members.\n⚠️ Bot must be admin for delete actions."
    });
}

/**
 * !antimention on/off - Toggle anti-mention protection
 */
export async function antimention(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antimention",
        featureName: "antimention",
        title: "ANTIMENTION",
        icon: "📣",
        enableText: "Non-admin members can no longer tag members, groups, statuses, or use @all / @everyone.",
        disableText: "Members can now mention freely again.",
        footer: "🛡️ Stops member mentions, native group/status mentions, and mention spam from non-admin members.\n⚠️ Bot needs admin privileges for delete actions."
    });
}

/**
 * !poll <question> | <option1> | <option2> ... - Create a poll
 */
export async function poll(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const fullText = args.join(" ");
    const parts = fullText.split("|").map(p => p.trim());

    if (parts.length < 3) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  📊 *ℂℝ𝔼𝔸𝕋𝔼 ℙ𝕆𝕃𝕃* 📊  ║
╚══════════════════════════════════╝

This command creates a WhatsApp poll in the group.

*Usage:* ${p}poll Question | Option1 | Option2 | ...

*Example:*
${p}poll Best programming language? | JavaScript | Python | Rust

You need at least 2 options!`;
    }

    const question = parts[0];
    const options = parts.slice(1);

    try {
        await sock.sendMessage(remoteJid, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1
            }
        });
        return null;
    } catch (err) {
        return `❌ Failed to create poll: ${err.message}`;
    }
}

/**
 * !warn @user - Warn a user (3 warns = kick)
 */
const warnCounts = new Map();

export async function warn(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    if (!await isBotAdmin(sock, remoteJid)) {
        return `⚠️ Bot must be an admin to warn members.`;
    }

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned || quoted;

    if (!target) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  ⚠️ *𝕎𝔸ℝℕ 𝕌𝕊𝔼ℝ* ⚠️  ║
╚══════════════════════════════════╝

This command warns a member, and 3 warnings can lead to an automatic kick.

*Usage:* ${p}warn @user
*Alt:* Reply to a message with ${p}warn

3 warnings = automatic kick!`;
    }

    const key = `${remoteJid}_${target}`;
    const currentWarns = (warnCounts.get(key) || 0) + 1;
    warnCounts.set(key, currentWarns);

    const number = target.split("@")[0];

    if (currentWarns >= 3) {
        try {
            await sock.groupParticipantsUpdate(remoteJid, [target], "remove");
            warnCounts.delete(key);
            return `╔══════════════════════════════════╗
║  🚫 *𝕌𝕊𝔼ℝ 𝕂𝕀ℂ𝕂𝔼𝔻* 🚫  ║
╚══════════════════════════════════╝

@${number} has been removed after 3 warnings!`;
        } catch (err) {
            return `❌ Failed to kick: ${err.message}`;
        }
    }

    return `╔══════════════════════════════════╗
║  ⚠️ *𝕎𝔸ℝℕ𝕀ℕ𝔾* ⚠️  ║
╚══════════════════════════════════╝

@${number} has been warned!

⚠️ *Warnings:* ${currentWarns}/3

${currentWarns === 2 ? "🚨 *Next warning will result in a kick!*" : ""}`;
}

/**
 * !resetwarn @user - Reset warnings for a user
 */
export async function resetwarn(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned || quoted;

    if (!target) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `This command clears all warnings for a member.\n\n*Usage:* ${p}resetwarn @user`;
    }

    const key = `${remoteJid}_${target}`;
    warnCounts.delete(key);
    const number = target.split("@")[0];

    return `✅ Warnings reset for @${number}`;
}

/**
 * !bot on/off - Toggle bot functionality in the group
 */
export async function botToggle(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    const status = args[0]?.toLowerCase();
    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";

    if (status === "on") {
        settings.botEnabled = true;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `✅ *Bot Enabled:* Tervux is now active in this group.`;
    } else if (status === "off") {
        settings.botEnabled = false;
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `📴 *Bot Disabled:* Tervux will no longer respond to commands in this group (except ${p}bot on).`;
    }

    return `*Status:* ${settings.botEnabled ? "✅ Active" : "📴 Inactive"}\n\nThis command turns bot replies on or off in the group.\n\n*Usage:* ${p}bot on/off`;
}

/**
 * !rejoin <group_jid> - Rejoin a group using saved invite code
 */
export async function rejoin(sock, m, args) {
    const targetJid = args[0];

    if (!targetJid) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `╔══════════════════════════════════╗
║  🔄 *ℝ𝔼𝕁𝕆𝕀ℕ 𝔾ℝ𝕆𝕌ℙ* 🔄  ║
╚════════════════════╚════════════╝

This command makes the bot rejoin a group using a previously saved invite code.

*Usage:* ${p}rejoin <group_id>

*How to find ID:* Check the bot logs or use ${p}groupinfo while in the group.`;
    }

    const inviteCode = await getInviteCode(sock.sessionId, targetJid);

    if (!inviteCode) {
        return `❌ *Invite Code Not Found*

I can only rejoin if:
1. I was an *Admin* when I left.
2. I successfully saved the invite link.
3. The link hasn't been revoked.

You might need to add me manually.`;
    }

    try {
        await sock.groupAcceptInvite(inviteCode);
        return `✅ Successfully rejoined the group!`;
    } catch (err) {
        console.error("Rejoin Error:", err);
        return `❌ *Failed to Rejoin*

*Reason:* ${err.message.includes("403") ? "Bot is banned or link revoked" : err.message}`;
    }
}

/**
 * !groupantidelete on/off - Toggle anti-delete for this group
 */
export async function antideleteg(sock, m, args) { return groupantidelete(sock, m, args); }
export async function groupantidelete(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `╔══════════════════════════════════╗
║  ⚠️ *𝔾ℝ𝕆𝕌ℙ 𝕆ℕ𝕃𝕐* ⚠️  ║
╚══════════════════════════════════╝

This command only works in groups.
Use *!antidelete* for personal chats.`;
    }

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        settings.groupAntiDelete = { enabled: true };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ✅ *𝔾ℝ𝕆𝕌ℙ 𝔸ℕ𝕋𝕀-𝔻𝔼𝕃𝔼𝕋𝔼 𝔼ℕ𝔸𝔹𝕃𝔼𝔻* ✅  ║
╚══════════════════════════════════╝

Deleted messages in this group will now be restored!

⚠️ *Note:* Bot owner's own deleted messages are always excluded.`;
    }

    if (action === "off") {
        settings.groupAntiDelete = { enabled: false };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `╔══════════════════════════════════╗
║  ❌ *𝔾ℝ𝕆𝕌ℙ 𝔸ℕ𝕋𝕀-𝔻𝔼𝕃𝔼𝕋𝔼 𝔻𝕀𝕊𝔸𝔹𝕃𝔼𝔻* ❌  ║
╚══════════════════════════════════╝

Deleted messages in this group will no longer be restored.`;
    }

    return `╔══════════════════════════════════╗
║  🛡️ *𝔾ℝ𝕆𝕌ℙ 𝔸ℕ𝕋𝕀-𝔻𝔼𝕃𝔼𝕋𝔼* 🛡️  ║
╚══════════════════════════════════╝

*Status:* ${settings.groupAntiDelete?.enabled ? "✅ Enabled" : "❌ Disabled"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commands:*
• !groupantidelete on - Enable
• !groupantidelete off - Disable

💡 Use *!antidelete* for personal chats.
🛡️ Restores deleted messages from other members!`;
}

/**
 * !antifake on/off - Toggle local-only mode (+255)
 */
export async function antifake(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "antifake",
        featureName: "antifake",
        title: "ANTIFAKE",
        icon: "🚩",
        enableText: "Only members with *+255* numbers will be allowed to join. Others will be removed automatically.",
        disableText: "International numbers are now allowed to join again.",
        footer: "🛡️ Blocks non-Tanzanian numbers from joining automatically.\n⚠️ Bot needs admin privileges to remove members.",
        requireBotAdmin: false
    });
}

/**
 * !autosticker on/off - Toggle auto image-to-sticker
 */
export async function autosticker(sock, m, args) {
    return handleSimpleProtectionToggle({
        sock,
        m,
        args,
        settingKey: "autosticker",
        featureName: "autosticker",
        title: "AUTOSTICKER",
        icon: "📸",
        enableText: "New images sent in this group will now be converted into stickers automatically.",
        disableText: "Images will no longer be converted into stickers automatically.",
        footer: "🛡️ Converts new images to stickers automatically.\n💡 No admin delete permission is required for this feature.",
        requireBotAdmin: false
    });
}

/**
 * !badword add/remove/list - Manage forbidden words
 */
export async function badword(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    if (!await isAdmin(sock, remoteJid, m.key.participant || m.key.remoteJid)) {
        return `⚠️ Only admins can manage settings.`;
    }

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const action = args[0]?.toLowerCase();
    const word = args.slice(1).join(" ").trim();

    if (action === "add") {
        if (!word) return `⚠️ Please provide a word to blacklist.`;
        if (settings.badwords.includes(word)) return `⚠️ "${word}" is already blacklisted.`;
        settings.badwords.push(word);
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `✅ Added "${word}" to the bad word list!`;
    } else if (action === "remove") {
        if (!word) return `⚠️ Please provide a word to remove.`;
        const index = settings.badwords.indexOf(word);
        if (index === -1) return `⚠️ "${word}" is not in the list.`;
        settings.badwords.splice(index, 1);
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `✅ Removed "${word}" from the list.`;
    } else if (action === "list") {
        if (settings.badwords.length === 0) return `📝 The bad word list is empty.`;
        return `📝 *𝔹𝕃𝔸ℂ𝕂𝕃𝕀𝕊𝕋𝔼𝔻 𝕎𝕆ℝ𝔻𝕊:* \n\n${settings.badwords.join(", ")}`;
    }

    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    return `╔══════════════════════════════════╗
║  🚫 *𝔹𝔸𝔻 𝕎𝕆ℝ𝔻 𝕄𝔸ℕ𝔸𝔾𝔼ℝ* 🚫  ║
╚══════════════════════════════════╝

This command lets admins add, remove, or list forbidden words in the group.

*Usage:*
• ${p}badword add <word>
• ${p}badword remove <word>
• ${p}badword list`;
}

/**
 * !stats - See who is the most active member
 */
export async function stats(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    try {
        const topStats = await GroupMemberStats.find({ sessionId: sock.sessionId, groupJid: remoteJid })
            .sort({ messageCount: -1 })
            .limit(10);

        if (topStats.length === 0) return `📊 No activity recorded yet!`;

        let output = `╔══════════════════════════════════╗\n║  📊 *𝔾ℝ𝕆𝕌ℙ 𝔸ℂ𝕋𝕀𝕍𝕀𝕋𝕐 𝕊𝕋𝔸𝕋𝕊* 📊  ║\n╚══════════════════════════════════╝\n\n`;
        const mentions = [];

        topStats.forEach((stat, i) => {
            const num = stat.userJid.split("@")[0];
            output += `${i + 1}. @${num} — *${stat.messageCount} msg*\n`;
            mentions.push(stat.userJid);
        });

        return { text: output, mentions };
    } catch (e) {
        return `❌ Error fetching stats: ${e.message}`;
    }
}

/**
 * !ghosts - Identify silent members
 */
export async function ghosts(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    if (!await isAdmin(sock, remoteJid, m.key.participant || m.key.remoteJid)) {
        return `⚠️ Only admins can use this.`;
    }

    try {
        const metadata = await sock.groupMetadata(remoteJid);
        const members = metadata.participants.map(p => p.id);
        
        // Find everyone who HAS spoken
        const activeMembers = await GroupMemberStats.find({ 
            sessionId: sock.sessionId, 
            groupJid: remoteJid 
        }).distinct("userJid");

        const ghostList = members.filter(id => !activeMembers.includes(id));

        if (ghostList.length === 0) return `🚀 No ghosts found! Everyone is active.`;

        let output = `╔══════════════════════════════════╗\n║  👻 *𝔾ℍ𝕆𝕊𝕋 𝕄𝔼𝕄𝔹𝔼ℝ𝕊* 👻  ║\n╚══════════════════════════════════╝\n\nFound ${ghostList.length} silent members:\n\n`;
        const mentions = ghostList.slice(0, 50); // Mention max 50 to avoid lag

        mentions.forEach((id, i) => {
            output += `${i + 1}. @${id.split("@")[0]}\n`;
        });

        if (ghostList.length > 50) output += `\n...and ${ghostList.length - 50} more.`;

        return { text: output, mentions };
    } catch (e) {
        return `❌ Error finding ghosts: ${e.message}`;
    }
}

/**
 * !tagadmins - Tag all admins
 */
export async function tagadmins(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    try {
        const metadata = await sock.groupMetadata(remoteJid);
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
        
        const msg = args.join(" ") || "🆘 *Attention Admins!*";
        
        return {
            text: `👑 *𝔸𝔻𝕄𝕀ℕ 𝕋𝔸𝔾:* \n\n${msg}`,
            mentions: admins
        };
    } catch (e) {
        return `❌ Error tagging admins: ${e.message}`;
    }
}

/**
 * !grouplock [duration] - Mute group for non-admins
 */
export async function grouplock(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return `⚠️ This only works in groups.`;

    if (!await isAdmin(sock, remoteJid, m.key.participant || m.key.remoteJid)) {
        return `⚠️ Only admins can lock the group.`;
    }

    const durationStr = args[0]?.toLowerCase() || "30m";
    let minutes = 30;

    if (durationStr.endsWith("m")) minutes = parseInt(durationStr);
    else if (durationStr.endsWith("h")) minutes = parseInt(durationStr) * 60;
    else if (durationStr === "off") {
        const settings = await loadGroupSettings(sock.sessionId, remoteJid);
        settings.grouplock = { until: null };
        await saveGroupSettings(sock.sessionId, remoteJid, settings);
        return `🔓 *𝔾ℝ𝕆𝕌ℙ 𝕌ℕ𝕃𝕆ℂ𝕂𝔼𝔻*`;
    }

    if (isNaN(minutes)) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        return `⚠️ This command locks the group for non-admins for a chosen time.\n\nInvalid duration. Example: ${p}grouplock 1h or ${p}grouplock 30m`;
    }

    const until = new Date(Date.now() + minutes * 60000);
    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    settings.grouplock = { until };
    await saveGroupSettings(sock.sessionId, remoteJid, settings);

    return `🔒 *𝔾ℝ𝕆𝕌ℙ 𝕃𝕆ℂ𝕂𝔼𝔻* 🔒\n\nGroup is locked for non-admins for *${durationStr}*.\n\n⏰ Unlocks at: ${until.toLocaleTimeString()}`;
}

/**
 * !groupstatus <text> - Post a WhatsApp Status visible to the group members
 */
export async function groupstatus(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!remoteJid.endsWith("@g.us")) {
        return `⚠️ This command only works in groups.`;
    }

    const isOwner = m.key.fromMe || m.key.participant === sock.user.id || m.key.remoteJid === sock.user.id;
    const adminCheck = await isAdmin(sock, remoteJid, m.key.participant || m.key.remoteJid);

    if (!isOwner && !adminCheck) {
        return `⚠️ Only the bot owner or group admins can use this command.`;
    }

    const text = args.join(" ");
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    // Get group members to set visibility
    let participants = [];
    try {
        const metadata = await sock.groupMetadata(remoteJid);
        participants = metadata.participants.map(p => p.id);
    } catch (err) {
        console.error("Group metadata error:", err.message);
    }

    const statusOptions = {
        backgroundColor: '#000000', // Default background for text status
        font: 1 // Default font
    };

    try {
        if (quotedMessage) {
            const type = Object.keys(quotedMessage)[0];
            const validMediaTypes = ['imageMessage', 'videoMessage'];

            if (validMediaTypes.includes(type)) {
                const buffer = await downloadMediaMessage(
                    { message: quotedMessage },
                    "buffer",
                    {},
                    { logger: console, reuploadRequest: sock.updateMediaMessage }
                );

                if (!buffer) throw new Error("Failed to download media buffer.");

                const mediaMsg = quotedMessage[type];
                const caption = text || mediaMsg.caption || "";

                if (type === 'imageMessage') {
                    await sock.sendMessage('status@broadcast', {
                        image: buffer,
                        caption
                    }, { statusJidList: participants });
                } else if (type === 'videoMessage') {
                    await sock.sendMessage('status@broadcast', {
                        video: buffer,
                        caption
                    }, { statusJidList: participants });
                }

                return `✅ *Status Posted!* Media status is now visible to the group members.`;
            } else if (type === 'conversation' || type === 'extendedTextMessage') {
                const msgText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
                const finalText = text ? `${text}\n\n${msgText}` : msgText;
                
                await sock.sendMessage('status@broadcast', {
                    text: finalText,
                    ...statusOptions
                }, { statusJidList: participants });

                return `✅ *Status Posted!* Text status is now visible to the group members.`;
            } else {
                return `❌ *Error:* Unsupported message type. Reply to text, image, or video.`;
            }
        } else if (text) {
            await sock.sendMessage('status@broadcast', {
                text: text,
                ...statusOptions
            }, { statusJidList: participants });

            return `✅ *Status Posted!* Text status is now visible to the group members.`;
        } else {
            const config = await getCachedConfig(sock.sessionId);
            const p = config.prefix || "!";
            return `╔══════════════════════════════════╗\n║  📢 *𝔾ℝ𝕆𝕌ℙ 𝕊𝕋𝔸𝕋𝕌𝕊* 📢  ║\n╚══════════════════════════════════╝\n\nPost a WhatsApp Status visible only to group members.\n\n*Usage:*\n${p}groupstatus <text>\n*Alt:* Reply to an image/video with ${p}groupstatus <optional caption>`;
        }
    } catch (err) {
        return `❌ Failed to post status: ${err.message}`;
    }
}
