/**
 * Group Settings Storage - Manages per-group settings like welcome/goodbye messages
 * Refactored to operate 100% on MongoDB for multi-tenant stateless safety.
 */

import GroupSettings from "../models/GroupSettings.js";

/**
 * Deep merge helper - merges nested objects instead of overwriting them
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

/**
 * Default group settings mapping for new records
 */
const DEFAULT_GROUP_SETTINGS = {
    welcome: {
        enabled: false,
        message: `╔══════════════════════════════════╗\n║  🎉 *𝕎𝔼𝕃ℂ𝕆𝕄𝔼* 🎉  ║\n╚══════════════════════════════════╝\n\nHey @user! 👋\n\nWelcome to *{group}*!\nYou are member *#{count}*.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📜 Please read the group rules\n💬 Introduce yourself\n🎉 Enjoy your stay!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    },
    goodbye: {
        enabled: false,
        message: `╔══════════════════════════════════╗\n║  👋 *𝔾𝕆𝕆𝔻𝔹𝕐𝔼* 👋  ║\n╚══════════════════════════════════╝\n\n@user has left the group.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nWe hope to see you again! 💫\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    },
    antilink: {
        enabled: false,
        action: "warn"
    },
    botEnabled: true,
    antispam: {
        enabled: false,
        maxMessages: 5,
        timeWindow: 10
    },
    groupAntiDelete: {
        enabled: false
    }
};

/**
 * Load settings for a group asynchronously from DB
 */
export async function loadGroupSettings(sessionId, groupJid) {
    if (!sessionId) {
        console.error("❌ Need sessionId in loadGroupSettings");
        return deepMerge({}, DEFAULT_GROUP_SETTINGS);
    }

    try {
        let doc = await GroupSettings.findOne({ sessionId, groupJid });
        if (!doc) {
            doc = await GroupSettings.create({ sessionId, groupJid, ...DEFAULT_GROUP_SETTINGS });
        }
        // Deep merge standard defaults over existing objects to prevent partial undefined values if schema changed
        return deepMerge(DEFAULT_GROUP_SETTINGS, doc.toObject());
    } catch (err) {
        console.error(`❌ Failed to load group settings for ${groupJid}:`, err.message);
        return deepMerge({}, DEFAULT_GROUP_SETTINGS);
    }
}

/**
 * Save settings for a group asynchronously to DB
 */
export async function saveGroupSettings(sessionId, groupJid, settings) {
    if (!sessionId) return false;
    try {
        await GroupSettings.updateOne(
            { sessionId, groupJid },
            { $set: settings },
            { upsert: true }
        );
        return true;
    } catch (err) {
        console.error(`❌ Failed to save group settings for ${groupJid}:`, err.message);
        return false;
    }
}

/**
 * Update specific group settings asynchronously
 */
export async function updateGroupSettings(sessionId, groupJid, updates) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    const newSettings = deepMerge(settings, updates);
    return await saveGroupSettings(sessionId, groupJid, newSettings);
}

/**
 * Get welcome message for a group
 */
export async function getWelcomeMessage(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.welcome;
}

/**
 * Get goodbye message for a group
 */
export async function getGoodbyeMessage(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.goodbye;
}

/**
 * Save invite code for a group
 */
export async function saveInviteCode(sessionId, groupJid, code) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    settings.inviteCode = code;
    settings.lastKnownName = settings.lastKnownName || "Unknown Group";
    settings.leftAt = new Date();
    return await saveGroupSettings(sessionId, groupJid, settings);
}

/**
 * Get invite code for a group
 */
export async function getInviteCode(sessionId, groupJid) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    return settings.inviteCode;
}

/**
 * Update last known group name
 */
export async function updateGroupName(sessionId, groupJid, name) {
    const settings = await loadGroupSettings(sessionId, groupJid);
    settings.lastKnownName = name;
    return await saveGroupSettings(sessionId, groupJid, settings);
}

/**
 * List all groups with saved invite codes mapping to the active session
 */
export async function getGroupsWithInviteCodes(sessionId) {
    if (!sessionId) return [];
    try {
        return await GroupSettings.find({
            sessionId,
            inviteCode: { $exists: true, $ne: "" }
        });
    } catch (err) {
        return [];
    }
}
