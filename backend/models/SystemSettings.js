import mongoose from "mongoose";
import { delKey, getJson, setJson } from "../lib/redis.js";

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
    commandFooter: {
        type: String,
        default: "╭──────────────────────────────╮\n│ *Powered by 𝕋𝔼ℝ𝕍𝕌𝕏 𝕒𝕟𝕕 𝔸𝕃𝕃𝔸ℕ𝕄𝕆𝕏 🤖*\n│ 🌐 *bot.tervux.com*\n╰──────────────────────────────╯"
    },
    kingBonusCoins: {
        type: Number,
        default: 100
    },
    referralBonus: {
        type: Number,
        default: 10
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, {
    timestamps: true
});

systemSettingsSchema.post("save", () => {
    invalidateSettingsCache().catch(() => {});
});

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);
const SETTINGS_CACHE_KEY = "system_settings:public:v1";
const SETTINGS_CACHE_TTL_SECONDS = Number(process.env.SETTINGS_CACHE_TTL_SECONDS || 30);

const toPublicSettings = (settingsDocOrObj) => ({
    maintenanceMode: !!settingsDocOrObj.maintenanceMode,
    registrationEnabled: !!settingsDocOrObj.registrationEnabled,
    supportPhone: settingsDocOrObj.supportPhone,
    siteName: settingsDocOrObj.siteName,
    commandFooter: settingsDocOrObj.commandFooter,
    kingBonusCoins: Number(settingsDocOrObj.kingBonusCoins || 100),
    referralBonus: Number(settingsDocOrObj.referralBonus || 10),
    updatedAt: settingsDocOrObj.updatedAt || null
});

// Ensure a single settings document exists
export const getSettings = async () => {
    let settings = await SystemSettings.findOne();
    if (!settings) {
        settings = await SystemSettings.create({});
    }
    return settings;
};

export const getCachedPublicSettings = async () => {
    const cached = await getJson(SETTINGS_CACHE_KEY);
    if (cached) return cached;

    const settings = await getSettings();
    const payload = toPublicSettings(settings);
    await setJson(SETTINGS_CACHE_KEY, payload, SETTINGS_CACHE_TTL_SECONDS);
    return payload;
};

export const invalidateSettingsCache = async () => {
    await delKey(SETTINGS_CACHE_KEY);
};

export default SystemSettings;
