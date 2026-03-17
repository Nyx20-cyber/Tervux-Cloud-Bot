import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  preferredLanguage?: "en" | "sw";
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
  hasHydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  updateCoins: (coins: number) => void;
  setUser: (user: User) => void;
  checkAuth: () => Promise<void>;
  forceLocalLogout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      login: (token, user) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: async () => {
        try {
          // Attempt to notify server
          await api.post("/auth/logout");
        } catch {
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
        } catch (error: unknown) {
          const axiosError = error as { response?: { status?: number; data?: { maintenance?: boolean } } };
          const status = axiosError?.response?.status;
          const isMaintenance = !!axiosError?.response?.data?.maintenance;

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
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
