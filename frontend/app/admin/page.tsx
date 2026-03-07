"use client";

import { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
    AlertTriangle, Loader2, RefreshCw, LayoutDashboard,
    Users, Network, History, Settings as SettingsIcon, Coins, Megaphone, Crown
} from "lucide-react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

import { AdminStats } from "@/components/admin/AdminStats";
import { AdminCharts } from "@/components/admin/AdminCharts";
import { SessionMonitor } from "@/components/admin/SessionMonitor";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import { PlanManagement } from "@/components/admin/PlanManagement";
import { CoinManagement } from "@/components/admin/CoinManagement";
import { AnnouncementSystem } from "@/components/admin/AnnouncementSystem";
import { UserManagement } from "@/components/admin/UserManagement";
import { AdminReferral } from "@/components/admin/AdminReferral";
import { GlobalSettings } from "@/components/admin/GlobalSettings";
import { AdminGamification } from "@/components/admin/AdminGamification";

export default function AdminDashboard() {
    const { user } = useAuthStore();
    const router = useRouter();
    const { language } = useLocaleStore();
    const t = translations[language];

    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("dashboard");

    const ADMIN_TABS = useMemo(() => [
        { id: "dashboard", label: t.dashboard, icon: LayoutDashboard },
        { id: "users", label: t.users, icon: Users },
        { id: "sessions", label: t.sessions, icon: Network },
        { id: "payments", label: t.payments, icon: History },
        { id: "plans", label: t.plans, icon: SettingsIcon },
        { id: "coins", label: t.billing, icon: Coins },
        { id: "referral", label: "Referral", icon: Crown },
        { id: "announcements", label: t.announcements, icon: Megaphone },
        { id: "gamification", label: "Badges & VIP", icon: Crown },
        { id: "settings", label: t.site_settings, icon: SettingsIcon },
    ], [t]);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/stats");
            setStats(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user && user.role !== "admin") {
            router.replace("/dashboard");
            return;
        }
        fetchStats();
    }, [user, router]);

    if (!user || user.role !== "admin") return null;

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in pr-0 sm:pr-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 text-red-500">
                            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] font-mono">{t.admin_panel}</span>
                        </div>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tight">
                            {t.admin_panel}
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest italic opacity-70">
                            {t.system_management}
                        </p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={fetchStats}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all disabled:opacity-50 backdrop-blur-xl"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        {t.refresh}
                    </motion.button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex items-center gap-2 border-b border-white/5 pb-6 overflow-x-auto no-scrollbar scroll-smooth">
                    {ADMIN_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-3 px-6 py-4 rounded-[1.25rem] transition-all duration-300 shrink-0 border group",
                                    isActive
                                        ? "bg-primary border-primary text-black shadow-lg shadow-primary/20"
                                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                <Icon className={cn(
                                    "w-4 h-4",
                                    isActive ? "text-black" : "text-gray-500 group-hover:text-primary transition-colors"
                                )} />
                                <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="min-h-[400px]">
                    {isLoading && !stats ? (
                        <div className="flex flex-col items-center justify-center p-24 bg-black/20 border border-white/5 rounded-[3rem] space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse"></div>
                                <Loader2 className="w-12 h-12 text-primary animate-spin relative z-10" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 italic">{t.loading_admin}</p>
                        </div>
                    ) : (
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                            className="space-y-8"
                        >
                            {activeTab === "dashboard" && (
                                <>
                                    <AdminStats stats={stats} />
                                    <AdminCharts
                                        recentPayments={stats?.recentPayments || []}
                                        stats={stats}
                                    />
                                </>
                            )}
                            {activeTab === "users" && <UserManagement />}
                            {activeTab === "sessions" && <SessionMonitor />}
                            {activeTab === "payments" && <PaymentHistory />}
                            {activeTab === "plans" && <PlanManagement />}
                            {activeTab === "coins" && <CoinManagement />}
                            {activeTab === "referral" && <AdminReferral />}
                            {activeTab === "announcements" && <AnnouncementSystem />}
                            {activeTab === "settings" && <GlobalSettings />}
                            {activeTab === "gamification" && <AdminGamification users={stats?.recentUsers || []} onUpdate={fetchStats} />}
                        </motion.div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}

// Helper to use cn in this file if not imported
function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ");
}
