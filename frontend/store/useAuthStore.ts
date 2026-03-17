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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "");
    const isAuthRoute =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/logout");

    // When JWT expires, silently log the user out and redirect to login from
    // any page without letting each screen raise its own error toast.
    if (typeof window !== "undefined" && status === 401 && !isAuthRoute) {
      const { token, isAuthenticated, forceLocalLogout } = useAuthStore.getState();
      if (token || isAuthenticated) {
        forceLocalLogout();
      }
      return new Promise(() => {});
    }

    return Promise.reject(error);
  }
);

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

          // Only clear the session on definitive auth failures.
          if (status === 401 || status === 403) {
            console.error("Auth check failed with definitive auth status:", error);
            set({ isAuthenticated: false, user: null, token: null });
            return;
          }

          // Keep the local session on transient/network/server errors to avoid
          // forcing users to log in again while the backend or connection recovers.
          console.error("Auth check failed temporarily; keeping local session:", error);
          set((state) => ({
            ...state,
            isAuthenticated: !!state.token
          }));
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
