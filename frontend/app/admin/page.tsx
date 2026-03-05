"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
    AlertTriangle, Loader2, RefreshCw, LayoutDashboard,
    Users, Network, History, Settings as SettingsIcon, Coins, Megaphone
} from "lucide-react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { AdminStats } from "@/components/admin/AdminStats";
import { AdminCharts } from "@/components/admin/AdminCharts";
import { SessionMonitor } from "@/components/admin/SessionMonitor";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import { PlanManagement } from "@/components/admin/PlanManagement";
import { CoinManagement } from "@/components/admin/CoinManagement";
import { AnnouncementSystem } from "@/components/admin/AnnouncementSystem";
import { UserManagement } from "@/components/admin/UserManagement";
import { GlobalSettings } from "@/components/admin/GlobalSettings";

const ADMIN_TABS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "sessions", label: "Sessions", icon: Network },
    { id: "payments", label: "Payments", icon: History },
    { id: "plans", label: "Plans", icon: SettingsIcon },
    { id: "coins", label: "Coins", icon: Coins },
    { id: "announcements", label: "Announcements", icon: Megaphone },
    { id: "settings", label: "Site Settings", icon: SettingsIcon },
];

export default function AdminDashboard() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("dashboard");

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
            <div className="space-y-8 animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                            Admin Panel
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            System management · Analytics · User control
                        </p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={fetchStats}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-all disabled:opacity-50 backdrop-blur-md"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </motion.button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex items-center gap-2 border-b border-white/5 pb-4 overflow-x-auto no-scrollbar scroll-smooth">
                    {ADMIN_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-300 shrink-0 border ${isActive
                                    ? "bg-primary/10 border-primary/30 text-primary shadow-lg shadow-primary/5"
                                    : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white"
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-gray-500"}`} />
                                <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="min-h-[400px]">
                    {isLoading && !stats ? (
                        <div className="flex flex-col items-center justify-center p-20 space-y-4">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Loading admin data...</p>
                        </div>
                    ) : (
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
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
                            {activeTab === "announcements" && <AnnouncementSystem />}
                            {activeTab === "settings" && <GlobalSettings />}
                        </motion.div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
