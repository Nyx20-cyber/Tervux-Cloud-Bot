import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import { authenticate } from "../middleware/auth.js";
import TutorialVideo from "../models/TutorialVideo.js";

const router = Router();

const sanitize = (value) => sanitizeHtml(String(value || ""), { allowedTags: [], allowedAttributes: {} }).trim();

const extractYoutubeVideoId = (value) => {
    const input = String(value || "").trim();
    if (!input) return null;

    const directMatch = input.match(/^[a-zA-Z0-9_-]{11}$/);
    if (directMatch) return directMatch[0];

    try {
        const url = new URL(input);
        const host = url.hostname.replace(/^www\./, "");

        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return id?.match(/^[a-zA-Z0-9_-]{11}$/) ? id : null;
        }

        if (host.endsWith("youtube.com")) {
            const watchId = url.searchParams.get("v");
            if (watchId?.match(/^[a-zA-Z0-9_-]{11}$/)) return watchId;

            const parts = url.pathname.split("/").filter(Boolean);
            const candidate = parts[1];
            if (["shorts", "embed", "live"].includes(parts[0]) && candidate?.match(/^[a-zA-Z0-9_-]{11}$/)) {
                return candidate;
            }
        }
    } catch {
        return null;
    }

    return null;
};

router.get("/", authenticate, async (_req, res) => {
    try {
        const tutorials = await TutorialVideo.find({ isActive: true })
            .sort({ createdAt: -1 })
            .select("title description youtubeUrl youtubeVideoId createdAt updatedAt");

        res.json({ tutorials });
    } catch (error) {
        console.error("Fetch tutorials error:", error);
        res.status(500).json({ error: "Failed to fetch tutorials" });
    }
});

export { extractYoutubeVideoId, sanitize };
export default router;
