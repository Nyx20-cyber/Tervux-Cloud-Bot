"use client";

import { useEffect, useRef } from "react";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { translations } from "@/lib/translations";

const TANZANIA_BOUNDS = {
  minLat: -11.9,
  maxLat: -0.9,
  minLng: 29.0,
  maxLng: 40.6,
};

function isInTanzania(latitude: number, longitude: number) {
  return (
    latitude >= TANZANIA_BOUNDS.minLat &&
    latitude <= TANZANIA_BOUNDS.maxLat &&
    longitude >= TANZANIA_BOUNDS.minLng &&
    longitude <= TANZANIA_BOUNDS.maxLng
  );
}

const AUTO_LANGUAGE_TOAST_ID = "auto-language-set";
const AUTO_LANGUAGE_TOAST_SESSION_KEY = "tervux:auto-language-toast:v1";

export default function LocaleBootstrap() {
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useLocaleStore((state) => state.hasHydrated);
  const source = useLocaleStore((state) => state.source);
  const applyAutoLanguage = useLocaleStore((state) => state.applyAutoLanguage);
  const applyAccountLanguage = useLocaleStore((state) => state.applyAccountLanguage);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated) return;

    if (source === "manual" || source === "account" || source === "auto") return;

    if (user?.preferredLanguage === "sw") {
      applyAccountLanguage("sw");
      return;
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      applyAutoLanguage("en");
      return;
    }

    let cancelled = false;

    const finalize = (lang: "en" | "sw") => {
      if (cancelled || hasResolvedRef.current) return;

      hasResolvedRef.current = true;
      const applied = applyAutoLanguage(lang);
      if (!applied) return;

      if (typeof window !== "undefined" && sessionStorage.getItem(AUTO_LANGUAGE_TOAST_SESSION_KEY) === "1") {
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem(AUTO_LANGUAGE_TOAST_SESSION_KEY, "1");
      }

      toast.success(
        lang === "sw"
          ? translations.sw.auto_language_set
          : translations.en.auto_language_set,
        { id: AUTO_LANGUAGE_TOAST_ID }
      );
    };

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        finalize(isInTanzania(coords.latitude, coords.longitude) ? "sw" : "en");
      },
      () => {
        finalize("en");
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 6 * 60 * 60 * 1000,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, source, user?.preferredLanguage, applyAutoLanguage, applyAccountLanguage]);

  return null;
}
