import { create } from "zustand";
import { api } from "./useAuthStore";

interface SessionState {
  sessions: any[];
  isLoading: boolean;
  fetchSessions: () => Promise<void>;
  createPairingReq: (phone: string, method: "qr" | "code") => Promise<any>;
  updateSessionLocally: (sessionId: string, updates: any) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  isLoading: true,

  fetchSessions: async () => {
    try {
      set({ isLoading: true });
      const res = await api.get("/sessions");
      set({ sessions: res.data.sessions, isLoading: false });
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("Fetch sessions failed:", error);
      }
      set({ isLoading: false, sessions: [] });
    }
  },

  updateSessionLocally: (sessionId: string, updates: any) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s._id === sessionId ? { ...s, ...updates } : s
      ),
    }));
  },

  createPairingReq: async (phoneNumber, method) => {
    try {
      const res = await api.post("/sessions/pair", { phoneNumber, method });
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Pairing request failed");
    }
  }
}));
