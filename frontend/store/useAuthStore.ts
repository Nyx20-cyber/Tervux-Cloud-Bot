import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

export const api = axios.create({
  baseURL: "/api", // Proxy will be configured in next.config.mjs or absolute
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface AuthState {
  token: string | null;
  user: any | null;
  isAuthenticated: boolean;
  login: (token: string, user: any) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => {
        localStorage.setItem("token", token);
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem("token");
        set({ token: null, user: null, isAuthenticated: false });
        window.location.href = "/login";
      },

      checkAuth: async () => {
        if (!localStorage.getItem("token")) {
          set({ isAuthenticated: false, user: null, token: null });
          return;
        }
        try {
          const res = await api.get("/auth/me");
          set({ user: res.data.user, isAuthenticated: true });
        } catch (error) {
          console.error("Auth check failed:", error);
          localStorage.removeItem("token");
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
