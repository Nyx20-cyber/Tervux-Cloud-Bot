import { create } from "zustand";
import { api } from "./useAuthStore";

interface SessionState {
  sessions: any[];
  isLoading: boolean;
  fetchSessions: () => Promise<void>;
  createPairingReq: (phone: string, method: "qr" | "code") => Promise<any>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  isLoading: true,

  fetchSessions: async () => {
    try {
      set({ isLoading: true });
      const res = await api.get("/sessions");

      let subRes;
      try {
        subRes = await api.get("/subscription");
      } catch (subErr) {
        console.error("Failed to fetch subscriptions:", subErr);
        subRes = { data: { subscriptions: [] } };
      }

      const merged = res.data.sessions.map((s: any) => {
        const subInfo = subRes.data.subscriptions?.find((sub: any) => sub.sessionId === s._id);
        return { ...s, subscriptionInfo: subInfo };
      });

      set({ sessions: merged, isLoading: false });
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("Fetch sessions failed:", error);
      }
      set({ isLoading: false, sessions: [] });
    }
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
