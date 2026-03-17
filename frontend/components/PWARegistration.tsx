"use client";

import { useEffect } from "react";

/**
 * PWARegistration Component
 * Handles the registration of the Service Worker for PWA support.
 * This must be a Client Component.
 */
export default function PWARegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("SW registered:", reg))
          .catch((err) => console.log("SW error:", err));
      });
    }
  }, []);

  return null;
}
