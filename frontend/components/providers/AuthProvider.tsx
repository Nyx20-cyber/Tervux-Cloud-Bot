"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { Loader2 } from "lucide-react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, checkAuth, token, hasHydrated } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (!hasHydrated) return;
        const verify = async () => {
            setIsChecking(true);
            await checkAuth();
            setIsChecking(false);
        };
        verify();
    }, [checkAuth, token, hasHydrated]);

    useEffect(() => {
        if (!hasHydrated) return;
        if (!isChecking) {
            if (!isAuthenticated && pathname.startsWith("/dashboard")) {
                router.replace("/login");
            } else if (isAuthenticated && (pathname === "/login" || pathname === "/register")) {
                router.replace("/dashboard");
            }
        }
    }, [isChecking, isAuthenticated, pathname, router, hasHydrated]);

    if (isChecking) {
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
