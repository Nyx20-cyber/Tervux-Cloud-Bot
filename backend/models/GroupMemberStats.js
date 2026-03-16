import mongoose from "mongoose";

const GroupMemberStatsSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WhatsAppSession",
        required: true
    },
    groupJid: {
        type: String,
        required: true
    },
    userJid: {
        type: String,
        required: true
    },
    messageCount: {
        type: Number,
        default: 0
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Ensure unique entry per user per group per session
GroupMemberStatsSchema.index({ sessionId: 1, groupJid: 1, userJid: 1 }, { unique: true });

const GroupMemberStats = mongoose.model("GroupMemberStats", GroupMemberStatsSchema);
export default GroupMemberStats;
