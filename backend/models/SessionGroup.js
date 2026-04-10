import mongoose from "mongoose";

const sessionGroupSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WhatsAppSession",
        required: true,
        index: true
    },
    groupJid: {
        type: String,
        required: true
    },
    firstSeenAt: {
        type: Date,
        default: null
    },
    lastSeenAt: {
        type: Date,
        default: null
    },
    leftAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

sessionGroupSchema.index({ sessionId: 1, groupJid: 1 }, { unique: true });
sessionGroupSchema.index({ sessionId: 1, firstSeenAt: -1 });

const SessionGroup = mongoose.model("SessionGroup", sessionGroupSchema);
export default SessionGroup;

