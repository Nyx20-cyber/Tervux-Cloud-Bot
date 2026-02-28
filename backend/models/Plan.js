import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "TZS"
    },
    durationDays: {
        type: Number,
        required: true
    },
    maxSessions: {
        type: Number,
        default: 1
    },
    description: {
        type: String,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Plan = mongoose.model("Plan", planSchema);
export default Plan;
