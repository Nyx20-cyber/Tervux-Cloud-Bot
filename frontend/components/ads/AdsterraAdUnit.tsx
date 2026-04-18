"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/store/useAuthStore";

/**
 * AdsterraAdUnit
 *
 * Renders a real bottom-banner ad inside a fixed slot using
 * Adsterra's iframe format loader.
 *
 * - Only loads in production environment
 * - Uses Adsterra iframe banner format instead of floating social-bar scripts
 * - Keeps ad placement inside the footer bar
 * - Gracefully hides when no banner config is available
 */
export function AdsterraAdUnit() {
    const [bannerKey, setBannerKey] = useState<string | null>(null);
    const [bannerHost, setBannerHost] = useState<string | null>(null);
    const [bannerWidth, setBannerWidth] = useState(320);
    const [bannerHeight, setBannerHeight] = useState(50);
    const [loadFailed, setLoadFailed] = useState(false);

    // Fetch the banner slot config from backend config
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;

        const fetchAdConfig = async () => {
            try {
                const res = await api.get("/config");
                const key = String(res.data?.adBannerKey || "").trim();
                const host = String(res.data?.adBannerHost || "").trim();
                const width = Number(res.data?.adBannerWidth || 320);
                const height = Number(res.data?.adBannerHeight || 50);

                if (key && host && /^https:\/\/[a-z0-9.-]+$/i.test(host)) {
                    setBannerKey(key);
                    setBannerHost(host);
                    setBannerWidth(Number.isFinite(width) && width > 0 ? width : 320);
                    setBannerHeight(Number.isFinite(height) && height > 0 ? height : 50);
                }
            } catch {
                // Backend unreachable or no ad config — fail silently
            }
        };
        fetchAdConfig();
    }, []);

    // In development, show a subtle placeholder
    if (process.env.NODE_ENV !== "production") {
        return (
            <div
                className="w-full flex items-center justify-center py-2 text-[9px]
                           font-bold uppercase tracking-widest text-gray-600 opacity-50"
            >
                [ Ad Placeholder — Loads in Production ]
            </div>
        );
    }

    if (!bannerKey || !bannerHost || loadFailed) {
        return null;
    }

    const frameSrc = useMemo(() => {
        const params = new URLSearchParams({
            key: bannerKey,
            host: bannerHost,
            width: String(bannerWidth),
            height: String(bannerHeight)
        });
        return `/adsterra-banner-frame.html?${params.toString()}`;
    }, [bannerHost, bannerHeight, bannerKey, bannerWidth]);

    return (
        <div
            className="w-full flex items-center justify-center overflow-hidden"
            style={{
                minHeight: `${bannerHeight}px`
            }}
        >
            <iframe
                title="Sponsored banner"
                src={frameSrc}
                width={bannerWidth}
                height={bannerHeight}
                loading="lazy"
                scrolling="no"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="block max-w-full border-0 bg-transparent"
                style={{
                    width: "100%",
                    maxWidth: `${bannerWidth}px`,
                    height: `${bannerHeight}px`
                }}
                onError={() => setLoadFailed(true)}
            />
        </div>
    );
}
