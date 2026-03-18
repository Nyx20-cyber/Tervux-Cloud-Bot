"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const {
        hasHydrated,
        token,
        user,
        authReady,
        authPhase,
        bootstrapAuth,
        refreshTokenExpiresAt,
        forceLocalLogout
    } = useAuthStore();

    const router = useRouter();
    const pathname = usePathname();
    const isProtectedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
    const isGuestRoute = pathname === "/login" || pathname === "/register";

    useEffect(() => {
        if (!hasHydrated) return;

        // Guest routes should stay visible unless we already have a token to validate.
        if (!isProtectedRoute && !token) {
            return;
        }

        if (authReady) {
            if (process.env.NODE_ENV !== "production") {
                console.info("[AuthProvider] Bootstrap skipped.", {
                    pathname,
                    authReady,
                    authPhase,
                    hasToken: Boolean(token),
                    userId: user?._id || null,
                });
            }
            return;
        }

        let cancelled = false;

        const runBootstrap = async () => {
            if (process.env.NODE_ENV !== "production") {
                console.info("[AuthProvider] Bootstrap requested.", {
                    pathname,
                    isProtectedRoute,
                    isGuestRoute,
                    hasToken: Boolean(token),
                    hasUser: Boolean(user?._id),
                });
            }

            await bootstrapAuth();

            if (!cancelled && process.env.NODE_ENV !== "production") {
                const state = useAuthStore.getState();
                console.info("[AuthProvider] Bootstrap finished.", {
                    pathname,
                    authReady: state.authReady,
                    authPhase: state.authPhase,
                    hasToken: Boolean(state.token),
                    userId: state.user?._id || null,
                });
            }
        };

        runBootstrap();

        return () => {
            cancelled = true;
        };
    }, [hasHydrated, pathname, isProtectedRoute, isGuestRoute, token, authReady, authPhase, user?._id, bootstrapAuth]);

    useEffect(() => {
        if (!hasHydrated || !token || !refreshTokenExpiresAt) return;

        const expiresAtMs = new Date(refreshTokenExpiresAt).getTime();
        if (!Number.isFinite(expiresAtMs)) return;

        const delayMs = expiresAtMs - Date.now();
        
        if (process.env.NODE_ENV !== "production") {
            console.info("[AuthProvider] Refresh timer evaluation.", {
                delayMs,
                refreshTokenExpiresAt,
                now: new Date().toISOString()
            });
        }

        if (delayMs <= 0) {
            if (process.env.NODE_ENV !== "production") {
                console.info("[AuthProvider] Session already expired. Forcing logout.", { delayMs });
            }
            forceLocalLogout();
            return;
        }

        /**
         * 🚨 TIMER SAFETY FIX:
         * Browsers cap setTimeout delay at 2,147,483,647ms (~24.8 days).
         * We cap our timer at 24 hours. If the expiry is further away,
         * we'll re-evaluate on the next render or navigation.
         */
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (delayMs > ONE_DAY_MS) {
            if (process.env.NODE_ENV !== "production") {
                console.info("[AuthProvider] Session expiry is > 24h away. Skipping timer for this render.");
            }
            return;
        }

        const timeout = window.setTimeout(() => {
            if (process.env.NODE_ENV !== "production") {
                console.info("[AuthProvider] Session expired. Triggering logout now.");
            }
            forceLocalLogout();
        }, delayMs);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [hasHydrated, token, refreshTokenExpiresAt, pathname, forceLocalLogout]);

    useEffect(() => {
        if (!hasHydrated || !authReady) return;

        if (process.env.NODE_ENV !== "production") {
            console.info("[AuthProvider] Evaluating redirect.", {
                pathname,
                isProtectedRoute,
                isGuestRoute,
                authPhase,
                hasToken: Boolean(token),
                userId: user?._id || null,
            });
        }

        if (authPhase === "anonymous" && isProtectedRoute) {
            router.replace("/login");
            return;
        }

        if (authPhase === "authenticated" && isGuestRoute) {
            router.replace("/dashboard");
        }
    }, [hasHydrated, authReady, authPhase, pathname, isProtectedRoute, isGuestRoute, token, user?._id, router]);

    if (isProtectedRoute && (!hasHydrated || !authReady || authPhase === "bootstrapping" || authPhase === "refreshing")) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background text-primary gap-4">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70 animate-pulse">
                    Authenticating link...
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
