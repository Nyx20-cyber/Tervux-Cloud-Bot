import WhatsAppSession from "../models/WhatsAppSession.js";

/**
 * DB-Backed Session Service
 * CRUD operations for WhatsApp sessions stored in MongoDB
 */

/**
 * Get session data by ID
 */
export async function getSessionData(sessionId) {
    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return null;

    return {
        phone: session.phone,
        name: session.name,
        prefix: session.settings?.prefix || "!",
        alwaysOnline: session.settings?.alwaysOnline || false,
        autoLikeStatus: session.settings?.autoLikeStatus ?? true,
        autoViewStatus: session.settings?.autoViewStatus || false,
        antiDelete: session.settings?.antiDelete || false,
        antiCall: session.settings?.antiCall || false,
        antiViewOnce: session.settings?.antiViewOnce || false,
        antiRemove: session.settings?.antiRemove || false,
        autoReadMessages: session.settings?.autoReadMessages || false,
        alwaysTyping: session.settings?.alwaysTyping || false,
        alwaysRecording: session.settings?.alwaysRecording || false
    };
}

/**
 * Update session settings
 */
export async function updateSessionSettings(sessionId, settings) {
    const updates = {};
    for (const [key, value] of Object.entries(settings)) {
        updates[`settings.${key}`] = value;
    }

    return WhatsAppSession.findByIdAndUpdate(
        sessionId,
        { $set: updates },
        { returnDocument: "after" }
    );
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(userId) {
    return WhatsAppSession.find({ userId }).sort({ createdAt: -1 });
}

/**
 * Get active session count for a user
 */
export async function getActiveSessionCount(userId) {
    return WhatsAppSession.countDocuments({
        userId,
        status: { $in: ["active", "pairing"] }
    });
}
