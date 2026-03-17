"use client";

import { useEffect } from "react";
import { usePWAStore } from "@/store/usePWAStore";

/**
 * PWARegistration Component
 * Handles the registration of the Service Worker and captures the install prompt.
 */
export default function PWARegistration() {
  const setDeferredPrompt = usePWAStore((state) => state.setDeferredPrompt);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("SW registered:", reg))
          .catch((err) => console.error("SW error:", err));
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
      }

      const handleBeforeInstallPrompt = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener("load", registerSW);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }
  }, [setDeferredPrompt]);

  return null;
}
