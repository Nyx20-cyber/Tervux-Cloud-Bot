"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { AdsterraAdUnit } from "@/components/ads/AdsterraAdUnit";

const DISMISS_KEY = "tervux_ad_dismissed";

/**
 * AdFooterBar
 *
 * A slim, non-intrusive footer-level ad bar that sits at the bottom
 * of the dashboard content area. Appears after a 3-second delay to
 * let users focus on content first.
 *
 * Features:
 * - Dismissable with X button (persisted to sessionStorage)
 * - Animated entrance (slide up + fade in)
 * - Dark theme with glassmorphism to match existing UI
 * - Max 56px height on desktop, slim on mobile
 * - Never blocks main content
 */
export function AdFooterBar() {
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Check if user already dismissed in this session
        try {
            if (sessionStorage.getItem(DISMISS_KEY) === "1") {
                setDismissed(true);
                return;
            }
        } catch {
            // sessionStorage may be unavailable in some contexts
        }

        // Show ad bar after 3 seconds — user focuses on content first
        const timer = setTimeout(() => setVisible(true), 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        setVisible(false);
        try {
            sessionStorage.setItem(DISMISS_KEY, "1");
        } catch {
            // Ignore if sessionStorage is unavailable
        }
    };

    if (dismissed) return null;

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: 56, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 56, opacity: 0 }}
                    transition={{ type: "spring", damping: 22, stiffness: 260 }}
                    className="relative z-30 w-full border-t border-white/[0.06]
                               bg-black/50 backdrop-blur-xl"
                    style={{ maxHeight: "56px" }}
                >
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                        {/* Ad content area */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <AdsterraAdUnit />
                        </div>

                        {/* Dismiss button */}
                        <button
                            onClick={handleDismiss}
                            className="shrink-0 p-1 rounded-full
                                       bg-white/[0.04] border border-white/[0.08]
                                       text-gray-600 hover:text-white
                                       hover:bg-white/10 transition-all duration-200"
                            aria-label="Dismiss ad"
                            title="Close"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
