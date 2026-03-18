import mongoose from "mongoose";

const messageConfigSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    message: { type: String, default: "" },
}, { _id: false });

const GroupSettingsSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WhatsAppSession",
        required: true
    },
    groupJid: {
        type: String,
        required: true
    },
    welcome: {
        type: messageConfigSchema,
        default: () => ({
            enabled: false,
            message: `╔══════════════════════════════════╗\n║  🎉 *𝕎𝔼𝕃ℂ𝕆𝕄𝔼* 🎉  ║\n╚══════════════════════════════════╝\n\nHey @user! 👋\n\nWelcome to *{group}*!\nYou are member *#{count}*.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📜 Please read the group rules\n💬 Introduce yourself\n🎉 Enjoy your stay!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        })
    },
    goodbye: {
        type: messageConfigSchema,
        default: () => ({
            enabled: false,
            message: `╔══════════════════════════════════╗\n║  👋 *𝔾𝕆𝕆𝔻𝔹𝕐𝔼* 👋  ║\n╚══════════════════════════════════╝\n\n@user has left the group.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nWe hope to see you again! 💫\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        })
    },
    antilink: {
        enabled: { type: Boolean, default: false },
        action: { type: String, enum: ["warn", "kick", "delete"], default: "warn" }
    },
    antisticker: {
        enabled: { type: Boolean, default: false },
        action: { type: String, enum: ["warn", "kick"], default: "warn" }
    },
    antitagall: {
        enabled: { type: Boolean, default: false }
    },
    botEnabled: { type: Boolean, default: true },
    antispam: {
        enabled: { type: Boolean, default: false },
        maxMessages: { type: Number, default: 5 },
        timeWindow: { type: Number, default: 10 } // seconds
    },
    groupAntiDelete: {
        enabled: { type: Boolean, default: false }
    },
    antimention: {
        enabled: { type: Boolean, default: false }
    },
    antivoice: {
        enabled: { type: Boolean, default: false }
    },
    antiimage: {
        enabled: { type: Boolean, default: false }
    },
    antivideo: {
        enabled: { type: Boolean, default: false }
    },
    antidocument: {
        enabled: { type: Boolean, default: false }
    },
    antiforward: {
        enabled: { type: Boolean, default: false }
    },
    antilongtext: {
        enabled: { type: Boolean, default: false },
        maxLength: { type: Number, default: 600 }
    },
    antipoll: {
        enabled: { type: Boolean, default: false }
    },
    antifake: {
        enabled: { type: Boolean, default: false }
    },
    badwords: {
        type: [String],
        default: []
    },
    autosticker: {
        enabled: { type: Boolean, default: false }
    },
    grouplock: {
        until: { type: Date, default: null }
    },
    inviteCode: { type: String, default: "" },
    lastKnownName: { type: String, default: "Unknown Group" },
    leftAt: { type: Date }
}, { timestamps: true });

// Ensure unique index per session+group combination
GroupSettingsSchema.index({ sessionId: 1, groupJid: 1 }, { unique: true });

const GroupSettings = mongoose.model("GroupSettings", GroupSettingsSchema);

export default GroupSettings;
