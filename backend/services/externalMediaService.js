import axios from "axios";
import { RAPID_API_HOST, RAPID_API_KEY } from "../env.js";

const RAPID_API_URL = `https://${RAPID_API_HOST}/yt/v5/download.php`;
const REQUEST_TIMEOUT = 120000;
const DOWNLOAD_RETRIES = 3;

const QUALITY_SCORE = {
    "144p": 144,
    "240p": 240,
    "360p": 360,
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
    "1440p": 1440,
    "2160p": 2160
};

const getQualityScore = (quality = "") => QUALITY_SCORE[quality] || Number.parseInt(quality, 10) || 0;

export const extractYouTubeId = (input = "") => {
    const value = input.trim();
    if (!value) return null;

    const directIdMatch = value.match(/^[A-Za-z0-9_-]{11}$/);
    if (directIdMatch) return directIdMatch[0];

    try {
        const url = new URL(value);
        if (url.hostname.includes("youtu.be")) {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
        }

        const watchId = url.searchParams.get("v");
        if (watchId && /^[A-Za-z0-9_-]{11}$/.test(watchId)) {
            return watchId;
        }

        const pathParts = url.pathname.split("/").filter(Boolean);
        const shortsIndex = pathParts.findIndex((part) => part === "shorts" || part === "embed");
        if (shortsIndex >= 0) {
            const id = pathParts[shortsIndex + 1];
            return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
        }
    } catch {
        return null;
    }

    return null;
};

export const fetchRapidYoutubeMedia = async (videoId) => {
    if (!RAPID_API_KEY) {
        throw new Error("YouTube download API is not configured. Add RAPID_API_KEY to backend/.env.");
    }

    const response = await axios.get(RAPID_API_URL, {
        params: { id: videoId },
        timeout: REQUEST_TIMEOUT,
        headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": RAPID_API_HOST,
            "x-rapidapi-key": RAPID_API_KEY
        }
    });

    if (response.data?.status !== "ok") {
        throw new Error("RapidAPI did not return a successful response.");
    }

    return response.data;
};

const isManifestUrl = (url = "") => /manifest|\.m3u8($|\?)/i.test(url);

export const selectBestAudioFormat = (results = []) => {
    const candidates = results.filter((item) => {
        if (!item?.url || isManifestUrl(item.url)) return false;
        if (typeof item.mime === "string" && item.mime.startsWith("audio/")) return true;
        return item.has_audio === true;
    });

    if (!candidates.length) return null;

    return candidates.sort((a, b) => getQualityScore(b.quality) - getQualityScore(a.quality))[0];
};

export const selectBestVideoFormat = (results = []) => {
    const progressiveWithAudio = results.filter((item) =>
        item?.url &&
        !isManifestUrl(item.url) &&
        item.mime === "video/mp4" &&
        item.has_audio === true
    );

    if (progressiveWithAudio.length) {
        return progressiveWithAudio.sort((a, b) => getQualityScore(b.quality) - getQualityScore(a.quality))[0];
    }

    const fallbackVideo = results.filter((item) => item?.url && item.mime === "video/mp4");
    if (!fallbackVideo.length) return null;

    return fallbackVideo.sort((a, b) => getQualityScore(b.quality) - getQualityScore(a.quality))[0];
};

export const downloadRemoteBuffer = async (url) => {
    let lastError = null;

    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
        try {
            const response = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: REQUEST_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                family: 4
            });

            return Buffer.from(response.data);
        } catch (error) {
            lastError = error;
            if (attempt === DOWNLOAD_RETRIES) {
                break;
            }
        }
    }

    throw lastError || new Error("Remote media download failed.");
};
