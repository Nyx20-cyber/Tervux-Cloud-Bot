import { create } from "zustand";
import axios from "axios";

export const api = axios.create({
  baseURL: "/api", // Proxy will be configured in next.config.mjs or absolute
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: "user" | "admin";
  coins: number;
  isBanned: boolean;
  dailyClaimCount?: number;
  lastDailyClaim?: string;
  badges: string[];
  isVIP: boolean;
  totalDeployments: number;
  totalReferrals: number;
  totalCoinsSpent: number;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  updateCoins: (coins: number) => void;
  setUser: (user: User) => void;
  checkAuth: () => Promise<void>;
  forceLocalLogout: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  login: (token, user) => {
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      // Attempt to notify server
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }
    set({ token: null, user: null, isAuthenticated: false });
    if (typeof window !== "undefined") window.location.href = "/login";
  },

  forceLocalLogout: () => {
    set({ token: null, user: null, isAuthenticated: false });
    if (typeof window !== "undefined") window.location.href = "/login";
  },

  updateCoins: (coins) => {
    set((state) => ({
      user: state.user ? { ...state.user, coins } : null
    }));
  },

  setUser: (user) => {
    set({ user: { ...user } });
  },

  checkAuth: async () => {
    if (!get().token) {
      set({ isAuthenticated: false, user: null, token: null });
      return;
    }
    try {
      const res = await api.get("/auth/me");
      set({ user: res.data.user, isAuthenticated: true });
    } catch (error: any) {
      const status = error?.response?.status;
      const isMaintenance = !!error?.response?.data?.maintenance;

      // During maintenance windows, keep token/session and fail silently.
      if (status === 503 && isMaintenance) {
        set((state) => ({
          ...state,
          isAuthenticated: !!state.token
        }));
        return;
      }

      console.error("Auth check failed:", error);
      set({ isAuthenticated: false, user: null, token: null });
    }
  },
}));
