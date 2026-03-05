import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["info", "warning", "maintenance", "update", "promo"],
        default: "info"
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, {
    timestamps: true
});

const Announcement = mongoose.model("Announcement", announcementSchema);
export default Announcement;
