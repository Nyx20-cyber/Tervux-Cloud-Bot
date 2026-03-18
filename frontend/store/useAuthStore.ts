import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

export const api = axios.create({
  baseURL: "/api", // Proxy will be configured in next.config.mjs or absolute
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;
let bootstrapPromise: Promise<void> | null = null;
const IS_DEV = process.env.NODE_ENV !== "production";

const debugAuth = (message: string, details?: Record<string, unknown>) => {
  if (!IS_DEV || typeof window === "undefined") return;
  if (details) {
    console.info(`[Auth] ${message}`, details);
    return;
  }
  console.info(`[Auth] ${message}`);
};

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    useAuthStore.getState().setAuthPhase("refreshing");
    debugAuth("Refresh started.");
    refreshPromise = api
      .post("/auth/refresh", null, {
        withCredentials: true,
      })
      .then((res) => {
        debugAuth("Refresh succeeded.", { userId: res.data?.user?._id });
        useAuthStore.getState().login(res.data.token, res.data.user, res.data.refreshTokenExpiresAt ?? null);
        return res.data.token as string;
      })
      .catch((error) => {
        debugAuth("Refresh failed.", { status: error?.response?.status ?? null });
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  (config as any).__authTokenSnapshot = token || null;
  if (IS_DEV) {
    debugAuth("Request started.", {
      url: String(config.url || ""),
      method: String(config.method || "get").toUpperCase(),
      hasToken: Boolean(token),
      skipAuthRefresh: Boolean((config as any).__skipAuthRefresh),
    });
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "");
    const requestTokenSnapshot = (error?.config as any)?.__authTokenSnapshot || null;
    const originalRequest = error?.config;
    const skipAuthRefresh = Boolean(originalRequest?.__skipAuthRefresh);
    const isAuthRoute =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout");

    if (typeof window !== "undefined" && status === 401 && !isAuthRoute) {
      if (skipAuthRefresh) {
        debugAuth("Passing through 401 without refresh.", {
          requestUrl,
          reason: "__skipAuthRefresh"
        });
        return Promise.reject(error);
      }

      const { token, isAuthenticated, authReady, forceLocalLogout } = useAuthStore.getState();
      const currentTokenSnapshot = token || null;
      // Ignore late 401 responses from stale requests that were sent with an
      // older token before a newer successful login replaced it.
      if (requestTokenSnapshot !== currentTokenSnapshot) {
        debugAuth("Ignored stale 401.", {
          requestUrl,
          hadRequestToken: Boolean(requestTokenSnapshot),
          hasCurrentToken: Boolean(currentTokenSnapshot),
        });
        return Promise.reject(error);
      }

      if ((token || isAuthenticated || authReady) && !originalRequest?._retry && !originalRequest?.__skipAuthRefresh) {
        debugAuth("401 intercepted; attempting refresh.", {
          requestUrl,
          hasToken: Boolean(token),
          isAuthenticated,
          authReady
        });
        originalRequest._retry = true;
        try {
          const nextToken = await refreshAccessToken();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${nextToken}`;
          originalRequest.__authTokenSnapshot = nextToken;
          return api(originalRequest);
        } catch (refreshError) {
          forceLocalLogout();
          const handledError = new Error("AUTH_HANDLED");
          (handledError as any).authHandled = true;
          (handledError as any).cause = refreshError;
          return Promise.reject(handledError);
        }
      }

      const handledError = new Error("AUTH_HANDLED");
      (handledError as any).authHandled = true;
      return Promise.reject(handledError);
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

type AuthPhase = "bootstrapping" | "anonymous" | "authenticated" | "refreshing";

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  authReady: boolean;
  authPhase: AuthPhase;
  refreshTokenExpiresAt: string | null;
  login: (token: string, user: User, refreshTokenExpiresAt?: string | null) => void;
  logout: () => Promise<void>;
  updateCoins: (coins: number) => void;
  setUser: (user: User) => void;
  checkAuth: () => Promise<void>;
  bootstrapAuth: () => Promise<void>;
  forceLocalLogout: () => void;
  setHasHydrated: (value: boolean) => void;
  setAuthPhase: (phase: AuthPhase) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      authReady: false,
      authPhase: "bootstrapping",
      refreshTokenExpiresAt: null,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setAuthPhase: (phase) => set({ authPhase: phase }),

      login: (token, user, refreshTokenExpiresAt = null) => {
        debugAuth("Login triggered.", { userId: user?._id, hasToken: !!token });
        set({
          token,
          user,
          isAuthenticated: true,
          refreshTokenExpiresAt,
          authReady: true,
          authPhase: "authenticated"
        });
      },

      logout: async () => {
        debugAuth("Logout requested by user.");
        try {
          // Attempt to notify server
          await api.post("/auth/logout");
        } catch {
          // ignore
        }
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          refreshTokenExpiresAt: null,
          authReady: true,
          authPhase: "anonymous"
        });
        if (typeof window !== "undefined") window.location.href = "/login";
      },

      forceLocalLogout: () => {
        debugAuth("Force local logout triggered.", {
          currentPath: typeof window !== "undefined" ? window.location.pathname : null
        });
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          refreshTokenExpiresAt: null,
          authReady: true,
          authPhase: "anonymous"
        });
        if (typeof window !== "undefined") window.location.href = "/login";
      },

      updateCoins: (coins) => {
        set((state) => ({
          user: state.user ? { ...state.user, coins } : null
        }));
      },

      setUser: (user) => {
        debugAuth("User state updated.", {
          userId: user?._id || null,
          role: user?.role || null
        });
        set({ user: { ...user } });
      },

      checkAuth: async () => {
        if (!get().token) {
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            refreshTokenExpiresAt: null,
            authReady: true,
            authPhase: "anonymous"
          });
          return;
        }
        try {
          const res = await api.get("/auth/me");
          debugAuth("checkAuth succeeded.", {
            userId: res.data?.user?._id || null
          });
          set({
            user: res.data.user,
            isAuthenticated: true,
            authReady: true,
            authPhase: "authenticated"
          });
        } catch (error: unknown) {
          if ((error as any)?.authHandled) {
            return;
          }
          const axiosError = error as { response?: { status?: number; data?: { maintenance?: boolean } } };
          const status = axiosError?.response?.status;
          const isMaintenance = !!axiosError?.response?.data?.maintenance;

          // During maintenance windows, keep token/session and fail silently.
          if (status === 503 && isMaintenance) {
            set((state) => ({
              ...state,
              isAuthenticated: !!state.token,
              authReady: true,
              authPhase: state.token ? "authenticated" : "anonymous"
            }));
            return;
          }

          // Only clear the session on definitive auth failures.
          if (status === 401 || status === 403) {
            debugAuth("checkAuth cleared session after definitive auth failure.", {
              status
            });
            set({
              isAuthenticated: false,
              user: null,
              token: null,
              refreshTokenExpiresAt: null,
              authReady: true,
              authPhase: "anonymous"
            });
            return;
          }

          // Keep the local session on transient/network/server errors to avoid
          // forcing users to log in again while the backend or connection recovers.
          console.error("Auth check failed temporarily; keeping local session:", error);
          set((state) => ({
            ...state,
            isAuthenticated: !!state.token,
            authReady: true,
            authPhase: state.token ? "authenticated" : "anonymous"
          }));
        }
      },

      bootstrapAuth: async () => {
        if (bootstrapPromise) {
          return bootstrapPromise;
        }

        bootstrapPromise = (async () => {
          const { token, refreshTokenExpiresAt, user, isAuthenticated, authReady, authPhase } = get();
          debugAuth("Bootstrap started.", {
            hasToken: Boolean(token),
            hasUser: Boolean(user?._id),
            hasRefreshExpiry: Boolean(refreshTokenExpiresAt),
            isAuthenticated,
            authReady,
            authPhase,
          });

          if (authReady && isAuthenticated && token && user?._id) {
            debugAuth("Bootstrap skipped: authenticated session already stable.");
            return;
          }

          if (authReady && !token && !isAuthenticated) {
            debugAuth("Bootstrap skipped: anonymous session already stable.");
            return;
          }

          if (!token) {
            set({
              user: null,
              isAuthenticated: false,
              refreshTokenExpiresAt: null,
              authReady: true,
              authPhase: "anonymous"
            });
            debugAuth("Bootstrap resolved anonymous (no token).");
            return;
          }

          if (refreshTokenExpiresAt) {
            const refreshExpiryMs = new Date(refreshTokenExpiresAt).getTime();
            if (Number.isFinite(refreshExpiryMs) && refreshExpiryMs <= Date.now()) {
              set({
                token: null,
                user: null,
                isAuthenticated: false,
                refreshTokenExpiresAt: null,
                authReady: true,
                authPhase: "anonymous"
              });
              debugAuth("Bootstrap cleared expired refresh session before auth check.");
              return;
            }
          }

          set({ authReady: false, authPhase: "bootstrapping" });

          try {
            const res = await api.get("/auth/me", {
              __skipAuthRefresh: true
            } as any);
            debugAuth("Bootstrap /auth/me succeeded.", {
              userId: res.data?.user?._id || null
            });
            set({
              user: res.data.user,
              isAuthenticated: true,
              authReady: true,
              authPhase: "authenticated"
            });
            debugAuth("Bootstrap completed with existing access token.");
            return;
          } catch (error: any) {
            const status = error?.response?.status;
            debugAuth("Bootstrap /auth/me failed.", { status: status ?? null });

            if (status === 401) {
              try {
                await refreshAccessToken();
                debugAuth("Bootstrap recovered via refresh.");
                return;
              } catch (refreshError: any) {
                debugAuth("Bootstrap refresh failed.", {
                  status: refreshError?.response?.status ?? null
                });
                set({
                  token: null,
                  user: null,
                  isAuthenticated: false,
                  refreshTokenExpiresAt: null,
                  authReady: true,
                  authPhase: "anonymous"
                });
                return;
              }
            }

            set((state) => ({
              ...state,
              isAuthenticated: Boolean(state.token),
              authReady: true,
              authPhase: state.token ? "authenticated" : "anonymous"
            }));
            debugAuth("Bootstrap kept local session after transient failure.", {
              status: status ?? null
            });
          }
        })().finally(() => {
          bootstrapPromise = null;
        });

        return bootstrapPromise;
      },
    }),
    {
      name: "auth-storage",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<AuthState>;
        const mergedState = {
          ...currentState,
          ...persisted,
        };

        const hasLiveSessionInMemory = Boolean(
          currentState.token &&
          currentState.isAuthenticated &&
          currentState.user?._id
        );

        const persistedLooksAnonymous = !persisted.token && !persisted.isAuthenticated;

        if (hasLiveSessionInMemory && persistedLooksAnonymous) {
          return {
            ...mergedState,
            token: currentState.token,
            user: currentState.user,
            isAuthenticated: currentState.isAuthenticated,
            refreshTokenExpiresAt: currentState.refreshTokenExpiresAt,
            authReady: currentState.authReady,
            authPhase: currentState.authPhase,
          };
        }

        return mergedState;
      },
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        refreshTokenExpiresAt: state.refreshTokenExpiresAt
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
