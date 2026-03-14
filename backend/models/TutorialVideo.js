import mongoose from "mongoose";

const tutorialVideoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 140
    },
    description: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1200
    },
    youtubeUrl: {
        type: String,
        required: true,
        trim: true
    },
    youtubeVideoId: {
        type: String,
        required: true,
        trim: true,
        index: true
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

const TutorialVideo = mongoose.model("TutorialVideo", tutorialVideoSchema);

export default TutorialVideo;
