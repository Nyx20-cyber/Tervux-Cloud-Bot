import mongoose from "mongoose";

const whatsAppSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    phone: {
        type: String,
        default: ""
    },
    authDir: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["pairing", "active", "disconnected", "paused", "expired"],
        default: "pairing",
        index: true
    },
    subscription: {
        planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
        status: { type: String, enum: ["none", "active", "expired", "paused"], default: "none" },
        activatedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null }
    },
    settings: {
        prefix: { type: String, default: "!" },
        alwaysOnline: { type: Boolean, default: false },
        autoLikeStatus: { type: Boolean, default: false },
        autoViewStatus: { type: Boolean, default: false },
        antiDelete: { type: Boolean, default: false },
        antiCall: { type: Boolean, default: false },
        antiViewOnce: { type: Boolean, default: false },
        antiRemove: { type: Boolean, default: false },
        autoReadMessages: { type: Boolean, default: false },
        alwaysTyping: { type: Boolean, default: false },
        alwaysRecording: { type: Boolean, default: false }
    },
    name: {
        type: String,
        default: "Bot User"
    },
    lastConnected: {
        type: Date,
        default: null
    },
    pairingStartedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const WhatsAppSession = mongoose.model("WhatsAppSession", whatsAppSessionSchema);
export default WhatsAppSession;
