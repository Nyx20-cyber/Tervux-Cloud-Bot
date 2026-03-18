import { loadGroupSettings, saveGroupSettings } from "./groupSettingsService.js";
import { getGroupMetadata, getGroupParticipantContext, invalidateGroupMetadataCache } from "../utils/groupUtils.js";
import { getCachedConfig } from "./configService.js";
import GroupMemberStats from "../models/GroupMemberStats.js";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { sticker } from "../commands/tools/sticker.js";

const enqueueLowPriority = (sock, label, fn) => {
    const manager = sock?.__sessionManager;
    if (manager?.enqueueLowPriorityTask) {
        manager.enqueueLowPriorityTask(sock.sessionId, label, fn);
        return;
    }

    Promise.resolve()
        .then(fn)
        .catch((error) => console.error(`[GroupLowPriority] ${label} failed:`, error.message));
};

/**
 * Handle Group Participants Update (Welcome/Goodbye)
 */
export async function handleGroupParticipantsUpdate(sock, update) {
    const { id, participants, action } = update;

    // Only handle add/remove
    if (action !== "add" && action !== "remove") return;

    // Normalize participants (some Baileys versions send objects instead of JIDs)
    const normalizedParticipants = (update.participants || []).map(p => typeof p === "string" ? p : p.id).filter(Boolean);

    console.log(`👥 [GroupEvent] Participants update: action=${action}, group=${id}, participants=${normalizedParticipants.join(", ")}`);

    try {
        invalidateGroupMetadataCache(sock.sessionId, id);
        const settings = await loadGroupSettings(sock.sessionId, id);
        console.log(`📋 [GroupEvent] Settings loaded: welcome.enabled=${settings.welcome?.enabled}, goodbye.enabled=${settings.goodbye?.enabled}`);

        const metadata = await getGroupMetadata(sock, id, { forceRefresh: true });
        if (!metadata) {
            console.error(`❌ [GroupEvent] Failed to get group metadata for ${id}`);
            return;
        }

        const botContext = await getGroupParticipantContext(sock, id, sock.user?.id || "");

        const groupName = metadata?.subject || "Group";
        const desc = metadata?.desc?.toString() || "";

        for (const participant of normalizedParticipants) {
            let messageText = "";
            let isWelcome = false;

            if (action === "add" && settings.welcome?.enabled) {
                messageText = settings.welcome.message || "";
                isWelcome = true;
                console.log(`✅ [GroupEvent] Welcome is enabled, preparing message for ${participant}`);
            } else if (action === "remove" && settings.goodbye?.enabled) {
                messageText = settings.goodbye.message || "";
                console.log(`✅ [GroupEvent] Goodbye is enabled, preparing message for ${participant}`);
            } else {
                console.log(`ℹ️ [GroupEvent] ${action === "add" ? "Welcome" : "Goodbye"} is disabled for group ${id}`);
            }

            if (messageText) {
                // Replace placeholders
                const user = `@${participant.split("@")[0]}`;
                const count = metadata?.participants?.length || "?";

                messageText = messageText
                    .replace(/{group}/g, groupName)
                    .replace(/{desc}/g, desc)
                    .replace(/{count}/g, count)
                    .replace(/@user/g, user);

                // Send message
                await sock.sendMessage(id, {
                    text: messageText,
                    mentions: [participant]
                });
                console.log(`📢 Sent ${isWelcome ? 'Welcome' : 'Goodbye'} message to ${id}`);
            }

            // --- 🚀 ANTIFAKE PROTECTION ---
            if (action === "add" && settings.antifake?.enabled) {
                // Check for +255 (Tanzania)
                const isLocal = participant.startsWith("255");
                if (!isLocal) {
                    console.log(`🛡️ [Antifake] Kicking non-255 number: ${participant} from ${id}`);
                    if (botContext.botIsAdmin) {
                        await sock.groupParticipantsUpdate(id, [participant], "remove");
                        await sock.sendMessage(id, {
                            text: `🛡️ *𝕋𝔼ℝ𝕍𝕌𝕏 𝔸ℕ𝕋𝕀𝔽𝔸𝕂𝔼* 🛡️\n\n@${participant.split("@")[0]} has been kicked. Only local (+255) numbers are allowed in this group!`,
                            mentions: [participant]
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error handling group participants update:", err.message);
    }
}

/**
 * Handle Group Messages (Antilink, Antispam)
 */
export async function handleGroupMessage(sock, m) {
    if (!m.message) return false;

    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return false;

    // Skip bot's own messages - check both fromMe flag and JID comparison
    if (m.key.fromMe) return false;
    const sender = m.key.participant || m.key.remoteJid;
    const botJid = (sock.user?.id?.split("@")[0]?.split(":")[0]) + "@s.whatsapp.net";
    if (sender.split(":")[0].split("@")[0] === botJid.split("@")[0]) return false;

    const settings = await loadGroupSettings(sock.sessionId, remoteJid);
    const groupContext = await getGroupParticipantContext(sock, remoteJid, sender);
    const senderIsAdmin = groupContext.senderIsAdmin;
    const botIsAdmin = groupContext.botIsAdmin;

    // Check if bot is disabled for this group
    if (settings.botEnabled === false) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        const msgText = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase().trim();

        // Only allow !bot on to pass through
        if (msgText === `${p}bot on`) {
            return false;
        }
        return true; // Return true to "consume" the message and stop further processing in whatsappClient.js
    }

    // 1. Antilink Check
    if (settings.antilink?.enabled) {
        const msgText = (
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            m.message.videoMessage?.caption ||
            ""
        ).toLowerCase();

        // Detect any URL using regex
        const urlRegex = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/i;
        const hasUrl = urlRegex.test(msgText);

        if (hasUrl) {
            // Whitelist check: Skip antilink for official domains
            const whitelist = [
                "tervux.com",
                "www.tervux.com",
                "github.com/JonniTech",
                "github.com/tervux",
                "instagram.com/tervux",
                "wa.me/message/tervux",
                "wa.me/255785046741",
                "tervux.portfolio",
                "nyaganya.tervux.com",
                "github.com/JonniTech/Tervux-WhatsApp-Bot",
                "nyaganyamalima47@gmail.com"
            ];

            const isWhitelisted = whitelist.some(domain => msgText.includes(domain));
            if (isWhitelisted) {
                console.log(`🛡️ [Antilink] Skipping whitelisted link in ${remoteJid}`);
                return false;
            }

            if (!senderIsAdmin) {
                console.log(`🛡️ Antilink triggered for ${sender} in ${remoteJid}`);

                if (!botIsAdmin) {
                    await sock.sendMessage(remoteJid, {
                        text: `🚫 *Link Detected!* I need admin privileges to manage antilink.`
                    });
                    return true;
                }

                // Delete message
                await sock.sendMessage(remoteJid, { delete: m.key });

                // Check action
                if (settings.antilink.action === "kick") {
                    await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
                    await sock.sendMessage(remoteJid, {
                        text: `🚫 *Link Detected!* @${sender.split("@")[0]} has been kicked for sharing links.`,
                        mentions: [sender]
                    });
                } else {
                    // Warn/Delete mode (default)
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ @${sender.split("@")[0]}, *links are not allowed* in this group! Your message has been deleted.`,
                        mentions: [sender]
                    });
                }
                return true; // Stop processing command/other things
            }
        }
    }

    // --- 🚀 ACTIVITY TRACKING ---
    enqueueLowPriority(sock, "group_member_stats", async () => {
        try {
            await GroupMemberStats.findOneAndUpdate(
                { sessionId: sock.sessionId, groupJid: remoteJid, userJid: sender },
                { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } },
                { upsert: true }
            );
        } catch (e) {
            console.error("Stats update error:", e.message);
        }
    });

    // --- 🚀 GROUPLOCK CHECK ---
    if (settings.grouplock?.until && new Date(settings.grouplock.until) > new Date()) {
        if (!senderIsAdmin) {
            console.log(`🛡️ [Grouplock] Deleting message from non-admin during lock in ${remoteJid}`);
            if (botIsAdmin) {
                await sock.sendMessage(remoteJid, { delete: m.key });
                return true;
            }
        }
    }

    // --- 🚀 BADWORD FILTER ---
    if (settings.badwords?.length > 0) {
        const msgText = (
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            m.message.videoMessage?.caption ||
            ""
        ).toLowerCase();

        const hasBadWord = settings.badwords.some(word => msgText.includes(word.toLowerCase()));
        if (hasBadWord) {
            if (!senderIsAdmin) {
                console.log(`🛡️ [Badword] Filtered message in ${remoteJid}`);
                if (botIsAdmin) {
                    await sock.sendMessage(remoteJid, { delete: m.key });
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ @${sender.split("@")[0]}, *bad words are not allowed!* Your message has been removed.`,
                        mentions: [sender]
                    });
                    return true;
                }
            }
        }
    }

    // --- 🚀 AUTOSTICKER ---
    if (settings.autosticker?.enabled) {
        const isImage = !!m.message.imageMessage;
        if (isImage) {
            if (botIsAdmin) {
                console.log(`🛡️ [Autosticker] Generating sticker for ${remoteJid}`);
                // Simple trick: We call the sticker function directly with the message
                // Since sticker function knows how to download from the message 'm'
                try {
                    await sticker(sock, m, []);
                } catch (e) {
                    console.error("Autosticker error:", e.message);
                }
            }
        }
    }

    // 2. Antimention Check
    if (settings.antimention?.enabled) {
        const msgText = (
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            m.message.videoMessage?.caption ||
            ""
        ).toLowerCase();

        const mentionedJids = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const hasTriggerText = msgText.includes("@all") || msgText.includes("@everyone") || msgText.includes("@status");
        const hasMentions = mentionedJids.length > 0;

        if (hasTriggerText || hasMentions) {
            const senderIsAdmin = await isAdmin(sock, remoteJid, sender);
            if (!senderIsAdmin) {
                console.log(`🛡️ Antimention triggered for ${sender} in ${remoteJid}`);

                const botIsAdmin = await isBotAdmin(sock, remoteJid);
                if (botIsAdmin) {
                    // Delete the forbidden mention
                    await sock.sendMessage(remoteJid, { delete: m.key });
                    
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ @${sender.split("@")[0]}, *mentions are disabled* in this group! Only admins can tag members or use @everyone.`,
                        mentions: [sender]
                    });
                    return true;
                }
            }
        }
    }

    // 3. Antispam (basic placeholder for now)
    // if (settings.antispam?.enabled) { ... }

    return false; // Continue processing
}
