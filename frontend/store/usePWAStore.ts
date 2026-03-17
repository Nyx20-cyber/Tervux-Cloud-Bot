import { create } from 'zustand';

interface PWAState {
  deferredPrompt: any | null;
  isInstallable: boolean;
  setDeferredPrompt: (prompt: any | null) => void;
  clearDeferredPrompt: () => void;
}

export const usePWAStore = create<PWAState>((set) => ({
  deferredPrompt: null,
  isInstallable: false,
  setDeferredPrompt: (prompt) => set({ 
    deferredPrompt: prompt, 
    isInstallable: !!prompt 
  }),
  clearDeferredPrompt: () => set({ 
    deferredPrompt: null, 
    isInstallable: false 
  }),
}));
