/**
 * In-Memory storage for Group Drama
 * No database, no disk space used.
 * Data clears on bot restart.
 */

// Format: { groupJid: { userJid: { partner: partnerJid, marriageDate: Date, proposal: proposerJid } } }
const dramaStore = new Map();

export const getGroupDrama = (groupJid) => {
    if (!dramaStore.has(groupJid)) {
        dramaStore.set(groupJid, {});
    }
    return dramaStore.get(groupJid);
};

export const clearGroupDrama = (groupJid) => {
    dramaStore.delete(groupJid);
};
