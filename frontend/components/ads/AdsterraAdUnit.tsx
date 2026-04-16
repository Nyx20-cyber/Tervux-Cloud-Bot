"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/store/useAuthStore";

/**
 * AdsterraAdUnit
 *
 * Safely injects the Adsterra Social Bar ad script into the DOM.
 * The script URL is fetched from the backend /api/config endpoint
 * (stored in backend .env, NOT hardcoded in frontend).
 *
 * - Only loads in production environment
 * - Fetches script URL from backend at runtime
 * - Cleans up on unmount to prevent memory leaks
 * - Gracefully handles script loading errors
 * - Never blocks or breaks the host application
 */
export function AdsterraAdUnit() {
    const containerRef = useRef<HTMLDivElement>(null);
    const scriptRef = useRef<HTMLScriptElement | null>(null);
    const [scriptUrl, setScriptUrl] = useState<string | null>(null);

    // Fetch the ad script URL from backend config
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;

        const fetchAdConfig = async () => {
            try {
                const res = await api.get("/config");
                const url = res.data?.adScriptUrl;
                if (url && typeof url === "string") {
                    setScriptUrl(url);
                }
            } catch {
                // Backend unreachable or no ad config — fail silently
            }
        };
        fetchAdConfig();
    }, []);

    // Inject the script once we have the URL
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;
        if (!scriptUrl || !containerRef.current) return;

        // Prevent duplicate injection
        if (scriptRef.current) return;

        try {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = scriptUrl;
            script.async = true;
            script.referrerPolicy = "no-referrer-when-downgrade";

            script.onerror = () => {
                // Ad script failed to load (likely ad blocker) — fail silently
            };

            containerRef.current.appendChild(script);
            scriptRef.current = script;
        } catch {
            // Never let an ad error break the application
        }

        return () => {
            // Cleanup on unmount
            if (scriptRef.current && scriptRef.current.parentNode) {
                scriptRef.current.parentNode.removeChild(scriptRef.current);
                scriptRef.current = null;
            }
        };
    }, [scriptUrl]);

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

    return <div ref={containerRef} className="w-full min-h-[1px]" />;
}
