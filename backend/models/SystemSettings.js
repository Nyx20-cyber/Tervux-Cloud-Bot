import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema({
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    registrationEnabled: {
        type: Boolean,
        default: true
    },
    supportPhone: {
        type: String,
        default: "+255629360383"
    },
    siteName: {
        type: String,
        default: "Tervux Cloud"
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, {
    timestamps: true
});

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

// Ensure a single settings document exists
export const getSettings = async () => {
    let settings = await SystemSettings.findOne();
    if (!settings) {
        settings = await SystemSettings.create({});
    }
    return settings;
};

export default SystemSettings;
