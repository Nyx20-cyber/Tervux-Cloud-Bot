import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

// SSR-safe localStorage access
const getToken = () => typeof window !== "undefined" ? localStorage.getItem("token") : null;
const setToken = (token: string) => typeof window !== "undefined" && localStorage.setItem("token", token);
const removeToken = () => typeof window !== "undefined" && localStorage.removeItem("token");

export const api = axios.create({
  baseURL: "/api", // Proxy will be configured in next.config.mjs or absolute
});

api.interceptors.request.use((config) => {
  const token = getToken();
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
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => {
        setToken(token);
        set({ token, user, isAuthenticated: true });
      },

      logout: async () => {
        try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
        removeToken();
        set({ token: null, user: null, isAuthenticated: false });
        if (typeof window !== "undefined") window.location.href = "/login";
      },

      updateCoins: (coins) => {
        set((state) => ({
          user: state.user ? { ...state.user, coins } : null
        }));
      },

      checkAuth: async () => {
        if (!getToken()) {
          set({ isAuthenticated: false, user: null, token: null });
          return;
        }
        try {
          const res = await api.get("/auth/me");
          set({ user: res.data.user, isAuthenticated: true });
        } catch (error) {
          console.error("Auth check failed:", error);
          removeToken();
          set({ isAuthenticated: false, user: null, token: null });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token }), // only persist token
    }
  )
);
