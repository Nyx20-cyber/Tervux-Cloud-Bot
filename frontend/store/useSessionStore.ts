import { create } from "zustand";
import { api } from "./useAuthStore";
import type { DeploymentDurationDays } from "@/lib/deploymentPricing";

export interface SessionSettings {
  [key: string]: string | boolean | undefined;
  prefix?: string;
  alwaysOnline?: boolean;
  autoLikeStatus?: boolean;
  autoViewStatus?: boolean;
  antiDelete?: boolean;
  antiCall?: boolean;
  autoReadMessages?: boolean;
  alwaysTyping?: boolean;
  alwaysRecording?: boolean;
}

export interface Session {
  _id: string;
  userId: string;
  phone?: string;
  name?: string;
  status: string;
  isLive?: boolean;
  expiresAt?: string;
  deployedAt?: string;
  deploymentDurationDays?: number | null;
  deploymentCostCoins?: number | null;
  settings: SessionSettings;
  updatedAt?: string;
  phoneNumber?: string;
  nodeId?: string;
  createdAt: string;
}

export interface DeploySessionResult {
  success: boolean;
  message: string;
  coins?: number;
  expiresAt?: string;
  deploymentDurationDays?: number;
  deploymentCostCoins?: number;
}

interface SessionState {
  sessions: Session[];
  isLoading: boolean;
  fetchSessions: () => Promise<void>;
  createPairingReq: (phone: string, method: "qr" | "code", socketId?: string) => Promise<any>;
  updateSessionLocally: (sessionId: string, updates: Partial<Session>) => void;
  updateSessionSettings: (sessionId: string, settings: SessionSettings) => Promise<void>;
  updateSessionStatus: (sessionId: string, status: string) => Promise<void>;
  deploySession: (sessionId: string, durationDays: DeploymentDurationDays) => Promise<DeploySessionResult>;
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
      if (!(error.response?.status === 503 && error.response?.data?.maintenance) && error.response?.status !== 401) {
        console.error("Fetch sessions failed:", error);
      }
      set({ isLoading: false, sessions: [] });
    }
  },

  updateSessionLocally: (sessionId: string, updates: Partial<Session>) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s._id === sessionId ? { ...s, ...updates } : s
      ),
    }));
  },

  createPairingReq: async (phone: string, method: "qr" | "code", socketId?: string) => {
    try {
      const res = await api.post("/sessions/pair", { phoneNumber: phone, method, socketId });
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Pairing request failed");
    }
  },

  updateSessionSettings: async (sessionId: string, settings: SessionSettings) => {
    try {
      const res = await api.put(`/sessions/${sessionId}/settings`, settings);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s._id === sessionId ? { ...s, settings: res.data.settings } : s
        ),
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to update settings");
    }
  },

  updateSessionStatus: async (sessionId: string, status: string) => {
    try {
      const endpoint = status === "active" ? "resume" : "pause";
      await api.post(`/sessions/${sessionId}/${endpoint}`);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s._id === sessionId ? { ...s, status } : s
        ),
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to update status");
    }
  },

  deploySession: async (sessionId: string, durationDays: DeploymentDurationDays) => {
    try {
      const res = await api.post(`/sessions/${sessionId}/deploy`, { durationDays });
      const payload = res.data as DeploySessionResult;
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s._id === sessionId
            ? {
                ...s,
                status: "active",
                expiresAt: payload.expiresAt ?? s.expiresAt,
                deploymentDurationDays: payload.deploymentDurationDays ?? durationDays,
                deploymentCostCoins: payload.deploymentCostCoins ?? s.deploymentCostCoins,
                deployedAt: new Date().toISOString(),
              }
            : s
        ),
      }));
      return payload;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Deployment failed");
    }
  }
}));
