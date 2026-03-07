import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "sw";

interface LocaleState {
    language: Language;
    setLanguage: (lang: Language) => void;
}

export const useLocaleStore = create<LocaleState>()(
    persist(
        (set) => ({
            language: "en",
            setLanguage: (lang) => set({ language: lang }),
        }),
        {
            name: "tervux-locale",
        }
    )
);
