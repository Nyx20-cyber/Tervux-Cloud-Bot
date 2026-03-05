import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["info", "warning", "error", "success"],
        default: "info"
    },
    isRead: {
        type: Boolean,
        default: false
    },
    link: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
