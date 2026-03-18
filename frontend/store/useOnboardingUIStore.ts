import { create } from "zustand";

interface OnboardingUIState {
  tutorialPromptOpen: boolean;
  tutorialPromptCheckComplete: boolean;
  setTutorialPromptOpen: (open: boolean) => void;
  setTutorialPromptCheckComplete: (complete: boolean) => void;
  resetTutorialPromptState: () => void;
}

export const useOnboardingUIStore = create<OnboardingUIState>((set) => ({
  tutorialPromptOpen: false,
  tutorialPromptCheckComplete: false,
  setTutorialPromptOpen: (open) => set({ tutorialPromptOpen: open }),
  setTutorialPromptCheckComplete: (complete) => set({ tutorialPromptCheckComplete: complete }),
  resetTutorialPromptState: () => set({
    tutorialPromptOpen: false,
    tutorialPromptCheckComplete: false,
  }),
}));
