import mongoose from "mongoose";

const WhatsAppAuthSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    /**
     * The Baileys data type identifier: e.g., "creds" or "app-state-sync-key"
     */
    type: {
        type: String,
        required: true
    },
    /**
     * The specific ID inside the data type: e.g., the key ID for sync keys.
     * For "creds", this is usually an empty string or "default".
     */
    id: {
        type: String,
        default: ""
    },
    /**
     * The JSON stringified representation of the Baileys Key/Creds state.
     * We store it as a String so Mongoose doesn't struggle parsing deeply nested buffers.
     */
    data: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Compound index for fast upserts: lookup primarily by sessionId + type + id
WhatsAppAuthSchema.index({ sessionId: 1, type: 1, id: 1 }, { unique: true });

const WhatsAppAuth = mongoose.models.WhatsAppAuth || mongoose.model("WhatsAppAuth", WhatsAppAuthSchema);

export default WhatsAppAuth;
