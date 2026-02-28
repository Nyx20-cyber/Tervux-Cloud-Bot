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
        required: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "TZS"
    },
    fastlipaTransactionId: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending",
        index: true
    },
    payerPhone: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
