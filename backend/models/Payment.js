import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WhatsAppSession",
        required: false,
        default: null
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        required: true
    },
    planName: {
        type: String,
        default: null
    },
    planSlug: {
        type: String,
        lowercase: true,
        default: null
    },
    planCoinsAmount: {
        type: Number,
        min: 1,
        default: null
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    provider: {
        type: String,
        enum: ["fastlipa", "bongopay", "minipay"],
        default: "fastlipa",
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ["mobile_money_tz", "card", "manual_minipay"],
        default: "mobile_money_tz"
    },
    currency: {
        type: String,
        default: "TZS"
    },
    fastlipaTransactionId: {
        type: String,
        default: null
    },
    gatewayReference: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed", "cancelled"],
        default: "pending",
        index: true
    },
    payerPhone: {
        type: String,
        required: true
    },
    failureReason: {
        type: String,
        default: null
    },
    gatewayResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, {
    timestamps: true
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
