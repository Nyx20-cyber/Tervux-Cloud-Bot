import mongoose from "mongoose";

const fastLipaWebhookLogSchema = new mongoose.Schema({
    source: {
        type: String,
        default: "fastlipa"
    },
    transactionId: {
        type: String,
        default: ""
    },
    paymentStatus: {
        type: String,
        default: ""
    },
    matchedPaymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
        default: null
    },
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    processingResult: {
        type: String,
        enum: ["received", "completed", "failed", "ignored", "error"],
        default: "received"
    },
    notes: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

const FastLipaWebhookLog = mongoose.model("FastLipaWebhookLog", fastLipaWebhookLogSchema);
export default FastLipaWebhookLog;
