import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "sw";
type LanguageSource = "default" | "auto" | "manual" | "account";

interface LocaleState {
    language: Language;
    source: LanguageSource;
    hasHydrated: boolean;
    setLanguage: (lang: Language) => void;
    applyAutoLanguage: (lang: Language) => boolean;
    applyAccountLanguage: (lang: Language) => boolean;
    setHasHydrated: (value: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
    persist(
        (set, get) => ({
            language: "en",
            source: "default",
            hasHydrated: false,
            setLanguage: (lang) => set({ language: lang, source: "manual" }),
            applyAutoLanguage: (lang) => {
                const currentSource = get().source;
                if (currentSource === "manual" || currentSource === "account") return false;
                set({ language: lang, source: "auto" });
                return true;
            },
            applyAccountLanguage: (lang) => {
                if (get().source === "manual") return false;
                set({ language: lang, source: "account" });
                return true;
            },
            setHasHydrated: (value) => set({ hasHydrated: value }),
        }),
        {
            name: "tervux-locale",
            version: 2,
            partialize: (state) => ({
                language: state.language,
                source: state.source,
            }),
            migrate: (persistedState: any, version) => {
                if (version < 2) {
                    const persistedLanguage = persistedState?.language === "sw" ? "sw" : "en";
                    return {
                        ...persistedState,
                        language: persistedLanguage,
                        source: persistedLanguage === "sw" ? "manual" : "default",
                    };
                }
                return persistedState;
            },
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
