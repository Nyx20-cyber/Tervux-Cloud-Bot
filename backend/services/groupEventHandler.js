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

const spamTracker = new Map();
const adminRequirementNoticeCooldowns = new Map();
const ADMIN_REQUIREMENT_NOTICE_COOLDOWN_MS = 15_000;
const TRACE_GROUP_PATH = process.env.WA_TRACE_GROUP_PATH === "true";
const TRACE_GROUP_EVENTS = process.env.WA_TRACE_GROUP_EVENTS === "true";
const SLOW_GROUP_PATH_WARN_MS = Number(process.env.WA_SLOW_GROUP_PATH_WARN_MS || 200);
const pendingGroupStats = new Map();
const pendingGroupStatsTimers = new Map();
const GROUP_STATS_FLUSH_DELAY_MS = Number(process.env.WA_GROUP_STATS_FLUSH_DELAY_MS || 8000);

// Periodic eviction for module-level Maps to prevent memory leaks at scale
setInterval(() => {
    const now = Date.now();
    // Evict stale spamTracker entries (older than 60s)
    for (const [key, timestamps] of spamTracker) {
        const fresh = timestamps.filter(ts => now - ts <= 60_000);
        if (fresh.length === 0) {
            spamTracker.delete(key);
        } else {
            spamTracker.set(key, fresh);
        }
    }
    // Evict stale admin requirement notice cooldowns (older than 60s)
    for (const [key, sentAt] of adminRequirementNoticeCooldowns) {
        if (now - sentAt > 60_000) {
            adminRequirementNoticeCooldowns.delete(key);
        }
    }
}, 5 * 60 * 1000);

function unwrapGroupMessageContent(message = {}) {
    let content = message;
    for (let i = 0; i < 8; i++) {
        if (content?.ephemeralMessage?.message) {
            content = content.ephemeralMessage.message;
            continue;
        }
        if (content?.viewOnceMessage?.message) {
            content = content.viewOnceMessage.message;
            continue;
        }
        if (content?.viewOnceMessageV2?.message) {
            content = content.viewOnceMessageV2.message;
            continue;
        }
        if (content?.viewOnceMessageV2Extension?.message) {
            content = content.viewOnceMessageV2Extension.message;
            continue;
        }
        break;
    }
    return content || {};
}

function extractGroupMessageText(content = {}) {
    return (
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption ||
        ""
    );
}

function extractContextInfo(content = {}) {
    return (
        content?.extendedTextMessage?.contextInfo ||
        content?.imageMessage?.contextInfo ||
        content?.videoMessage?.contextInfo ||
        content?.audioMessage?.contextInfo ||
        content?.documentMessage?.contextInfo ||
        content?.stickerMessage?.contextInfo ||
        content?.pollCreationMessage?.contextInfo ||
        content?.pollCreationMessageV2?.contextInfo ||
        content?.pollCreationMessageV3?.contextInfo ||
        {}
    );
}

function isVoiceNote(content = {}) {
    const audio = content?.audioMessage;
    return Boolean(audio && (audio.ptt === true || String(audio.mimetype || "").includes("audio/ogg")));
}

function isForwardedMessage(content = {}) {
    const contextInfo = extractContextInfo(content);
    return Boolean(contextInfo?.isForwarded || Number(contextInfo?.forwardingScore || 0) > 0);
}

function isPollMessage(content = {}) {
    return Boolean(content?.pollCreationMessage || content?.pollCreationMessageV2 || content?.pollCreationMessageV3);
}

function isMassMention(msgText = "", mentionedJids = []) {
    const lowered = String(msgText || "").toLowerCase();
    return (
        lowered.includes("@all") ||
        lowered.includes("@everyone") ||
        lowered.includes("@here") ||
        lowered.includes("@admins") ||
        mentionedJids.length >= 5
    );
}

function getSessionLaneDepths(sock) {
    const manager = sock?.__sessionManager;
    const sid = String(sock?.sessionId || "");
    return {
        command: manager?.commandLaneDepths?.get?.(sid) || 0,
        low: manager?.lowPriorityLaneDepths?.get?.(sid) || 0
    };
}

function logGroupPathTrace(sock, remoteJid, payload = {}, options = {}) {
    const totalMs = Number(payload.totalMs || 0);
    const shouldWarn = options.warn === true || totalMs >= SLOW_GROUP_PATH_WARN_MS;
    if (!TRACE_GROUP_PATH && !shouldWarn) return;
    const sid = String(sock?.sessionId || "unknown");
    const printer = shouldWarn ? console.warn : console.log;
    const parts = [
        `total=${totalMs}ms`,
        `consumed=${payload.consumed === true}`,
        `settings=${payload.settingsSource || "unknown"}`,
        `metadata=${payload.metadataSource || "n/a"}`,
        `context=${Number(payload.contextMs || 0)}ms`,
        `cmdLane=${Number(payload.commandLaneDepth || 0)}`,
        `lowLane=${Number(payload.lowLaneDepth || 0)}`
    ];
    if (payload.trigger) parts.push(`trigger=${payload.trigger}`);
    printer(`🩺 [${sid}] handleGroupMessage ${remoteJid}: ${parts.join(" ")}`);
}

function queueGroupMemberStatsUpdate(sock, remoteJid, sender) {
    const key = `${sock.sessionId}:${remoteJid}:${sender}`;
    const current = pendingGroupStats.get(key) || {
        sessionId: sock.sessionId,
        groupJid: remoteJid,
        userJid: sender,
        count: 0
    };
    current.count += 1;
    pendingGroupStats.set(key, current);

    if (pendingGroupStatsTimers.has(key)) {
        return;
    }

    const timer = setTimeout(() => {
        pendingGroupStatsTimers.delete(key);
        const next = pendingGroupStats.get(key);
        if (!next) return;
        pendingGroupStats.delete(key);

        enqueueLowPriority(sock, "group_member_stats", async () => {
            try {
                await GroupMemberStats.findOneAndUpdate(
                    { sessionId: next.sessionId, groupJid: next.groupJid, userJid: next.userJid },
                    { $inc: { messageCount: next.count }, $set: { lastMessageAt: new Date() } },
                    { upsert: true }
                );
            } catch (e) {
                console.error("Stats update error:", e.message);
            }
        });
    }, GROUP_STATS_FLUSH_DELAY_MS);

    pendingGroupStatsTimers.set(key, timer);
}

function isSpamTriggered(sessionId, remoteJid, sender, config = {}) {
    const key = `${sessionId}:${remoteJid}:${sender}`;
    const now = Date.now();
    const timeWindowMs = Math.max(Number(config.timeWindow || 10), 3) * 1000;
    const maxMessages = Math.max(Number(config.maxMessages || 5), 3);
    const recentTimestamps = (spamTracker.get(key) || []).filter((ts) => now - ts <= timeWindowMs);
    recentTimestamps.push(now);
    spamTracker.set(key, recentTimestamps);
    return recentTimestamps.length > maxMessages;
}

async function sendAdminRequirementNotice(sock, remoteJid, featureKey, text) {
    const key = `${sock.sessionId}:${remoteJid}:${featureKey}`;
    const now = Date.now();
    const lastSentAt = adminRequirementNoticeCooldowns.get(key) || 0;
    if (now - lastSentAt < ADMIN_REQUIREMENT_NOTICE_COOLDOWN_MS) {
        return;
    }
    adminRequirementNoticeCooldowns.set(key, now);
    await sock.sendMessage(remoteJid, { text });
}

async function enforceGroupRestriction({
    sock,
    m,
    remoteJid,
    sender,
    senderIsAdmin,
    botIsAdmin,
    triggered,
    featureKey,
    adminRequiredText,
    warnText,
    kick = false,
    kickText = ""
}) {
    if (!triggered || senderIsAdmin) return false;

    if (!botIsAdmin) {
        await sendAdminRequirementNotice(sock, remoteJid, featureKey, adminRequiredText);
        return true;
    }

    await sock.sendMessage(remoteJid, { delete: m.key });

    if (kick) {
        await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
        if (kickText) {
            await sock.sendMessage(remoteJid, {
                text: kickText,
                mentions: [sender]
            });
        }
        return true;
    }

    if (warnText) {
        await sock.sendMessage(remoteJid, {
            text: warnText,
            mentions: [sender]
        });
    }

    return true;
}

/**
 * Handle Group Participants Update (Welcome/Goodbye)
 */
export async function handleGroupParticipantsUpdate(sock, update) {
    const { id, participants, action } = update;

    // Only handle add/remove
    if (action !== "add" && action !== "remove") return;

    // Normalize participants (some Baileys versions send objects instead of JIDs)
    const normalizedParticipants = (update.participants || []).map(p => typeof p === "string" ? p : p.id).filter(Boolean);

    if (TRACE_GROUP_EVENTS) {
        console.log(`👥 [GroupEvent] Participants update: action=${action}, group=${id}, participants=${normalizedParticipants.join(", ")}`);
    }

    try {
        const settings = await loadGroupSettings(sock.sessionId, id);
        const welcomeEnabled = settings.welcome?.enabled === true;
        const goodbyeEnabled = settings.goodbye?.enabled === true;
        const antifakeEnabled = settings.antifake?.enabled === true;
        if (TRACE_GROUP_EVENTS || welcomeEnabled || goodbyeEnabled || antifakeEnabled) {
            console.log(`📋 [GroupEvent] Settings loaded: welcome.enabled=${welcomeEnabled}, goodbye.enabled=${goodbyeEnabled}, antifake.enabled=${antifakeEnabled}`);
        }

        const shouldHandleWelcome = action === "add" && welcomeEnabled;
        const shouldHandleGoodbye = action === "remove" && goodbyeEnabled;
        const shouldHandleAntifake = action === "add" && antifakeEnabled;
        if (!shouldHandleWelcome && !shouldHandleGoodbye && !shouldHandleAntifake) {
            if (TRACE_GROUP_EVENTS) {
                console.log(`ℹ️ [GroupEvent] No enabled participant automations for group ${id}. Skipping.`);
            }
            return;
        }

        invalidateGroupMetadataCache(sock.sessionId, id);

        const metadata = await getGroupMetadata(sock, id, { forceRefresh: true });
        if (!metadata) {
            console.error(`❌ [GroupEvent] Failed to get group metadata for ${id}`);
            return;
        }

        const needsBotAdmin = shouldHandleAntifake;
        const botContext = needsBotAdmin
            ? await getGroupParticipantContext(sock, id, sock.user?.id || "")
            : { botIsAdmin: false };

        const groupName = metadata?.subject || "Group";
        const desc = metadata?.desc?.toString() || "";

        for (const participant of normalizedParticipants) {
            let messageText = "";
            let isWelcome = false;

            if (action === "add" && welcomeEnabled) {
                messageText = settings.welcome.message || "";
                isWelcome = true;
                if (TRACE_GROUP_EVENTS) {
                    console.log(`✅ [GroupEvent] Welcome is enabled, preparing message for ${participant}`);
                }
            } else if (action === "remove" && goodbyeEnabled) {
                messageText = settings.goodbye.message || "";
                if (TRACE_GROUP_EVENTS) {
                    console.log(`✅ [GroupEvent] Goodbye is enabled, preparing message for ${participant}`);
                }
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
            if (action === "add" && antifakeEnabled) {
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

    if (m.key.fromMe) return false;
    const sender = m.key.participant || m.key.remoteJid;
    const botJid = (sock.user?.id?.split("@")[0]?.split(":")[0]) + "@s.whatsapp.net";
    if (sender.split(":")[0].split("@")[0] === botJid.split("@")[0]) return false;

    const startedAt = Date.now();
    const laneDepths = getSessionLaneDepths(sock);
    const content = unwrapGroupMessageContent(m.message);
    const msgTextRaw = extractGroupMessageText(content);
    const msgText = String(msgTextRaw || "").toLowerCase();
    const contextInfo = extractContextInfo(content);
    const mentionedJids = contextInfo?.mentionedJid || [];

    const settingsResult = await loadGroupSettings(sock.sessionId, remoteJid, TRACE_GROUP_PATH ? { returnMeta: true } : {});
    const settings = TRACE_GROUP_PATH ? settingsResult.settings : settingsResult;
    const settingsMeta = TRACE_GROUP_PATH ? settingsResult.meta : null;
    const fastPathProfile = settings.__fastPathProfile || {};
    let contextMeta = null;
    let triggerLabel = "none";

    if (TRACE_GROUP_PATH && settingsMeta?.source === "db") {
        console.warn(`🩺 [${sock.sessionId}] Group settings DB fallback for ${remoteJid}: total=${settingsMeta.elapsedMs}ms`);
    }

    let groupContextPromise = null;
    const getGroupContextLazy = async () => {
        if (!groupContextPromise) {
            groupContextPromise = (async () => {
                const contextResult = await getGroupParticipantContext(
                    sock,
                    remoteJid,
                    sender,
                    TRACE_GROUP_PATH ? { returnMeta: true } : {}
                );
                if (TRACE_GROUP_PATH) {
                    contextMeta = contextResult.meta || null;
                }
                return TRACE_GROUP_PATH ? contextResult.context : contextResult;
            })();
        }
        return groupContextPromise;
    };

    if (settings.botEnabled === false) {
        const config = await getCachedConfig(sock.sessionId);
        const p = config.prefix || "!";
        if (msgText.trim() === `${p}bot on`) {
            return false;
        }
        logGroupPathTrace(sock, remoteJid, {
            totalMs: Date.now() - startedAt,
            consumed: true,
            settingsSource: settingsMeta?.source,
            metadataSource: contextMeta?.metadataSource,
            contextMs: contextMeta?.totalMs,
            commandLaneDepth: laneDepths.command,
            lowLaneDepth: laneDepths.low,
            trigger: "bot_disabled"
        });
        return true;
    }

    const isSticker = !!content.stickerMessage;
    const isImage = !!content.imageMessage;
    const hasVoiceNote = isVoiceNote(content);
    const hasVideo = !!content.videoMessage;
    const hasDocument = !!content.documentMessage;
    const hasPoll = isPollMessage(content);
    const hasForward = isForwardedMessage(content);
    const hasMassMention = isMassMention(msgText, mentionedJids);
    const hasMentionTrigger = hasMassMention || msgText.includes("@status") || mentionedJids.length > 0;
    const maxLongTextLength = Math.max(Number(settings.antilongtext?.maxLength || 600), 150);
    const hasLongText = msgTextRaw.trim().length > maxLongTextLength;
    const hasBadWord = fastPathProfile.hasBadwords === true
        ? settings.badwords.some((word) => msgText.includes(String(word).toLowerCase()))
        : false;
    const hasGrouplock = fastPathProfile.hasGrouplock === true;
    const urlRegex = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/i;
    const hasUrl = settings.antilink?.enabled ? urlRegex.test(msgText) : false;
    const shouldTrackSpam = settings.antispam?.enabled === true;
    const spamTriggered = shouldTrackSpam ? isSpamTriggered(sock.sessionId, remoteJid, sender, settings.antispam) : false;

    queueGroupMemberStatsUpdate(sock, remoteJid, sender);

    const mightNeedModerationContext = Boolean(
        spamTriggered ||
        (settings.antiforward?.enabled && hasForward) ||
        (settings.antilongtext?.enabled && hasLongText) ||
        (settings.antitagall?.enabled && hasMassMention) ||
        (settings.antilink?.enabled && hasUrl) ||
        (settings.antisticker?.enabled && isSticker) ||
        (settings.antivoice?.enabled && hasVoiceNote) ||
        (settings.antiimage?.enabled && isImage) ||
        (settings.antivideo?.enabled && hasVideo) ||
        (settings.antidocument?.enabled && hasDocument) ||
        (settings.antipoll?.enabled && hasPoll) ||
        (settings.antimention?.enabled && hasMentionTrigger) ||
        hasGrouplock ||
        hasBadWord ||
        (settings.autosticker?.enabled && isImage)
    );

    if (!mightNeedModerationContext) {
        logGroupPathTrace(sock, remoteJid, {
            totalMs: Date.now() - startedAt,
            consumed: false,
            settingsSource: settingsMeta?.source,
            metadataSource: contextMeta?.metadataSource,
            contextMs: contextMeta?.totalMs,
            commandLaneDepth: laneDepths.command,
            lowLaneDepth: laneDepths.low,
            trigger: fastPathProfile.hasModerationEnabled ? "no_match" : "fast_skip"
        });
        return false;
    }

    if (spamTriggered) {
        triggerLabel = "antispam";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antispam",
            adminRequiredText: `🚫 *Spam Detected!* I need admin privileges to manage antispam.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *please slow down!* Spam messages are not allowed in this group.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antiforward?.enabled && hasForward) {
        triggerLabel = "antiforward";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antiforward",
            adminRequiredText: `🚫 *Forwarded Message Detected!* I need admin privileges to manage antiforward.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *forwarded messages are not allowed* in this group! Your message has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antilongtext?.enabled && hasLongText) {
        triggerLabel = "antilongtext";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antilongtext",
            adminRequiredText: `🚫 *Long Message Detected!* I need admin privileges to manage antilongtext.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *long messages are not allowed* in this group! Please keep it under ${maxLongTextLength} characters.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antitagall?.enabled && hasMassMention) {
        triggerLabel = "antitagall";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antitagall",
            adminRequiredText: `🚫 *Mass Mention Detected!* I need admin privileges to manage antitagall.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *mass mentions are not allowed* in this group! Your message has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antilink?.enabled && hasUrl) {
        triggerLabel = "antilink";
        const whitelist = [
            "tervux.com",
            "www.tervux.com",
            "github.com/JonniTech",
            "github.com/tervux",
            "instagram.com/tervux",
            "wa.me/message/tervux",
            "wa.me/255785046741",
            "tervux.portfolio",
            "bot.tervux.com",
            "nyaganya.tervux.com",
            "github.com/JonniTech/Tervux-WhatsApp-Bot",
            "nyaganyamalima47@gmail.com"
        ];
        const isWhitelisted = whitelist.some(domain => msgText.includes(domain));
        if (isWhitelisted) {
            console.log(`🛡️ [Antilink] Skipping whitelisted link in ${remoteJid}`);
            return false;
        }

        const groupContext = await getGroupContextLazy();
        if (!groupContext.senderIsAdmin) {
            console.log(`🛡️ Antilink triggered for ${sender} in ${remoteJid}`);
            if (!groupContext.botIsAdmin) {
                await sock.sendMessage(remoteJid, {
                    text: `🚫 *Link Detected!* I need admin privileges to manage antilink.`
                });
                logGroupPathTrace(sock, remoteJid, {
                    totalMs: Date.now() - startedAt,
                    consumed: true,
                    settingsSource: settingsMeta?.source,
                    metadataSource: contextMeta?.metadataSource,
                    contextMs: contextMeta?.totalMs,
                    commandLaneDepth: laneDepths.command,
                    lowLaneDepth: laneDepths.low,
                    trigger: triggerLabel
                });
                return true;
            }

            await sock.sendMessage(remoteJid, { delete: m.key });
            if (settings.antilink.action === "kick") {
                await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
                await sock.sendMessage(remoteJid, {
                    text: `🚫 *Link Detected!* @${sender.split("@")[0]} has been kicked for sharing links.`,
                    mentions: [sender]
                });
            } else {
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ @${sender.split("@")[0]}, *links are not allowed* in this group! Your message has been deleted.`,
                    mentions: [sender]
                });
            }
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (hasGrouplock) {
        triggerLabel = "grouplock";
        const groupContext = await getGroupContextLazy();
        if (!groupContext.senderIsAdmin) {
            console.log(`🛡️ [Grouplock] Deleting message from non-admin during lock in ${remoteJid}`);
            if (groupContext.botIsAdmin) {
                await sock.sendMessage(remoteJid, { delete: m.key });
                logGroupPathTrace(sock, remoteJid, {
                    totalMs: Date.now() - startedAt,
                    consumed: true,
                    settingsSource: settingsMeta?.source,
                    metadataSource: contextMeta?.metadataSource,
                    contextMs: contextMeta?.totalMs,
                    commandLaneDepth: laneDepths.command,
                    lowLaneDepth: laneDepths.low,
                    trigger: triggerLabel
                });
                return true;
            }
        }
    }

    if (hasBadWord) {
        triggerLabel = "badwords";
        const groupContext = await getGroupContextLazy();
        if (!groupContext.senderIsAdmin) {
            console.log(`🛡️ [Badword] Filtered message in ${remoteJid}`);
            if (groupContext.botIsAdmin) {
                await sock.sendMessage(remoteJid, { delete: m.key });
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ @${sender.split("@")[0]}, *bad words are not allowed!* Your message has been removed.`,
                    mentions: [sender]
                });
                logGroupPathTrace(sock, remoteJid, {
                    totalMs: Date.now() - startedAt,
                    consumed: true,
                    settingsSource: settingsMeta?.source,
                    metadataSource: contextMeta?.metadataSource,
                    contextMs: contextMeta?.totalMs,
                    commandLaneDepth: laneDepths.command,
                    lowLaneDepth: laneDepths.low,
                    trigger: triggerLabel
                });
                return true;
            }
        }
    }

    if (settings.antisticker?.enabled && isSticker) {
        triggerLabel = "antisticker";
        const groupContext = await getGroupContextLazy();
        if (!groupContext.senderIsAdmin) {
            console.log(`🛡️ [Antisticker] Triggered for ${sender} in ${remoteJid}`);
            if (!groupContext.botIsAdmin) {
                await sock.sendMessage(remoteJid, {
                    text: `🚫 *Sticker Detected!* I need admin privileges to manage antisticker.`
                });
                logGroupPathTrace(sock, remoteJid, {
                    totalMs: Date.now() - startedAt,
                    consumed: true,
                    settingsSource: settingsMeta?.source,
                    metadataSource: contextMeta?.metadataSource,
                    contextMs: contextMeta?.totalMs,
                    commandLaneDepth: laneDepths.command,
                    lowLaneDepth: laneDepths.low,
                    trigger: triggerLabel
                });
                return true;
            }

            await sock.sendMessage(remoteJid, { delete: m.key });
            if (settings.antisticker.action === "kick") {
                await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
                await sock.sendMessage(remoteJid, {
                    text: `🚫 *Sticker blocked!* @${sender.split("@")[0]} has been removed for sending stickers.`,
                    mentions: [sender]
                });
            } else {
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ @${sender.split("@")[0]}, *stickers are not allowed* in this group! Your sticker has been deleted.`,
                    mentions: [sender]
                });
            }
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antivoice?.enabled && hasVoiceNote) {
        triggerLabel = "antivoice";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antivoice",
            adminRequiredText: `🚫 *Voice Note Detected!* I need admin privileges to manage antivoice.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *voice notes are not allowed* in this group! Your voice note has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antiimage?.enabled && isImage) {
        triggerLabel = "antiimage";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antiimage",
            adminRequiredText: `🚫 *Image Detected!* I need admin privileges to manage antiimage.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *images are not allowed* in this group! Your image has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antivideo?.enabled && hasVideo) {
        triggerLabel = "antivideo";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antivideo",
            adminRequiredText: `🚫 *Video Detected!* I need admin privileges to manage antivideo.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *videos are not allowed* in this group! Your video has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antidocument?.enabled && hasDocument) {
        triggerLabel = "antidocument";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antidocument",
            adminRequiredText: `🚫 *Document Detected!* I need admin privileges to manage antidocument.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *documents are not allowed* in this group! Your document has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.antipoll?.enabled && hasPoll) {
        triggerLabel = "antipoll";
        const groupContext = await getGroupContextLazy();
        const consumed = await enforceGroupRestriction({
            sock,
            m,
            remoteJid,
            sender,
            senderIsAdmin: groupContext.senderIsAdmin,
            botIsAdmin: groupContext.botIsAdmin,
            triggered: true,
            featureKey: "antipoll",
            adminRequiredText: `🚫 *Poll Detected!* I need admin privileges to manage antipoll.`,
            warnText: `⚠️ @${sender.split("@")[0]}, *polls are not allowed* in this group! Your poll has been deleted.`
        });
        if (consumed) {
            logGroupPathTrace(sock, remoteJid, {
                totalMs: Date.now() - startedAt,
                consumed: true,
                settingsSource: settingsMeta?.source,
                metadataSource: contextMeta?.metadataSource,
                contextMs: contextMeta?.totalMs,
                commandLaneDepth: laneDepths.command,
                lowLaneDepth: laneDepths.low,
                trigger: triggerLabel
            });
            return true;
        }
    }

    if (settings.autosticker?.enabled && isImage) {
        triggerLabel = "autosticker";
        const groupContext = await getGroupContextLazy();
        if (groupContext.botIsAdmin) {
            console.log(`🛡️ [Autosticker] Generating sticker for ${remoteJid}`);
            try {
                await sticker(sock, m, []);
            } catch (e) {
                console.error("Autosticker error:", e.message);
            }
        }
    }

    if (settings.antimention?.enabled && hasMentionTrigger) {
        triggerLabel = "antimention";
        const groupContext = await getGroupContextLazy();
        if (!groupContext.senderIsAdmin) {
            console.log(`🛡️ Antimention triggered for ${sender} in ${remoteJid}`);
            if (groupContext.botIsAdmin) {
                await sock.sendMessage(remoteJid, { delete: m.key });
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ @${sender.split("@")[0]}, *mentions are disabled* in this group! Only admins can tag members or use @everyone.`,
                    mentions: [sender]
                });
                logGroupPathTrace(sock, remoteJid, {
                    totalMs: Date.now() - startedAt,
                    consumed: true,
                    settingsSource: settingsMeta?.source,
                    metadataSource: contextMeta?.metadataSource,
                    contextMs: contextMeta?.totalMs,
                    commandLaneDepth: laneDepths.command,
                    lowLaneDepth: laneDepths.low,
                    trigger: triggerLabel
                });
                return true;
            }
        }
    }

    logGroupPathTrace(sock, remoteJid, {
        totalMs: Date.now() - startedAt,
        consumed: false,
        settingsSource: settingsMeta?.source,
        metadataSource: contextMeta?.metadataSource,
        contextMs: contextMeta?.totalMs,
        commandLaneDepth: laneDepths.command,
        lowLaneDepth: laneDepths.low,
        trigger: triggerLabel
    });
    return false;
}
