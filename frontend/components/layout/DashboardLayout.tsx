"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WhatsAppFloat } from "./WhatsAppFloat";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [banMessage, setBanMessage] = useState("");
    const [maintenanceChecked, setMaintenanceChecked] = useState(false);
    const { token, isAuthenticated, logout, setUser, updateCoins, user } = useAuthStore();
    const { language } = useLocaleStore();
    const t = translations[language];
    const router = useRouter();

    useEffect(() => {
        if (!token) {
            setMaintenanceChecked(true);
            return;
        }
        // Wait until auth profile is hydrated before rendering dashboard content.
        if (!user) {
            setMaintenanceChecked(false);
            return;
        }
        if (!isAuthenticated) {
            setMaintenanceChecked(true);
            return;
        }

        const checkMaintenance = async () => {
            try {
                const res = await fetch(`/api/config?_t=${Date.now()}`);
                const data = await res.json();
                const isMaintenance = !!data?.maintenanceMode;
                const isAdmin = user?.role === "admin";
                if (isMaintenance && !isAdmin) {
                    router.replace("/");
                    return;
                }
            } catch {
                // Ignore transient config errors
            } finally {
                setMaintenanceChecked(true);
            }
        };
        checkMaintenance();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        const handleForceLogout = async (payload?: { message?: string }) => {
            setBanMessage(payload?.message || t.account_suspended_logout_notice);
            setBanDialogOpen(true);
            setTimeout(() => {
                logout();
            }, 1200);
        };

        socket.on("force_logout", handleForceLogout);
        socket.on("account_status_update", (payload: { isBanned?: boolean; role?: string }) => {
            if (payload?.isBanned) {
                handleForceLogout({ message: t.account_suspended_logout_notice });
            }
        });

        socket.on("account_gamification_updated", (payload: { badges?: string[]; isVIP?: boolean }) => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser) return;

            setUser({
                ...currentUser,
                badges: Array.isArray(payload?.badges) ? payload.badges : currentUser.badges,
                isVIP: typeof payload?.isVIP === "boolean" ? payload.isVIP : currentUser.isVIP
            });
        });

        socket.on("account_profile_updated", (payload: { user?: typeof user }) => {
            const incomingUser = payload?.user;
            const currentUser = useAuthStore.getState().user;
            if (!incomingUser || !currentUser) return;
            setUser({
                ...currentUser,
                ...incomingUser
            });
        });

        socket.on("balance_update", (payload: { coins?: number; delta?: number; reason?: string }) => {
            const nextCoins = Number(payload?.coins);
            if (!Number.isFinite(nextCoins)) return;

            const prev = useAuthStore.getState().user?.coins ?? 0;
            updateCoins(nextCoins);

            if (nextCoins > prev) {
                const gained = Number.isFinite(Number(payload?.delta)) && Number(payload?.delta) > 0
                    ? Number(payload.delta)
                    : (nextCoins - prev);
                toast.success(`🪙 +${gained} coins added`);
            }
        });

        socket.on("platform_settings_updated", (payload: { maintenanceMode?: boolean }) => {
            if (typeof payload?.maintenanceMode !== "boolean") return;
            const currentUser = useAuthStore.getState().user;
            const isAdmin = currentUser?.role === "admin";
            if (payload.maintenanceMode && !isAdmin) {
                router.replace("/");
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [token, isAuthenticated, logout, setUser, updateCoins, t.account_suspended_logout_notice, user, router]);

    return (
        <div className="flex h-screen overflow-hidden bg-transparent">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Mobile Sidebar */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="p-0 border-r border-border bg-card/90 backdrop-blur-2xl w-[84vw] max-w-[280px]">
                    <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                    <Sidebar isMobile />
                </SheetContent>
            </Sheet>

            <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
                <Header onMenuClick={() => setMobileMenuOpen(true)} />
                <main className="flex-1 overflow-y-auto w-full no-scrollbar">
                    <div className="mx-auto max-w-7xl p-3 sm:p-4 lg:p-8 pb-24 sm:pb-28 lg:pb-24 animate-fade-in relative z-10 w-full min-h-full">
                        {maintenanceChecked ? (
                            children
                        ) : (
                            <div className="min-h-[60vh] flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            </div>
                        )}
                    </div>
                </main>
                <WhatsAppFloat />
            </div>

            <Dialog open={banDialogOpen}>
                <DialogContent className="max-w-md border-red-500/30 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-red-300 flex items-center gap-2">
                            <motion.span
                                animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="inline-flex"
                            >
                                <AlertTriangle className="w-4 h-4 text-red-400" />
                            </motion.span>
                            {t.account_suspended_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {banMessage || t.account_suspended_logout_notice}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-400">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
                        </span>
                        {t.logging_out_now}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
