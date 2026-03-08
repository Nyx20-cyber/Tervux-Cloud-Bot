"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Activity, ShieldCheck, RefreshCcw, Network, Coins, Rocket, Megaphone, Info, AlertTriangle, Wrench, Sparkles, Tag } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { api } from "@/store/useAuthStore";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { DailyCheckIn } from "@/components/dashboard/DailyCheckIn";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Loader2, TrendingUp, CreditCard, UserPlus, Bell, Settings, ArrowUpRight, History } from "lucide-react";

interface AnnouncementRecord {
    _id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "maintenance" | "update" | "promo";
    isActive: boolean;
    createdBy?: { name?: string };
    createdAt: string;
}

interface DashboardStats {
    referralGrowth: { date: string, count: number }[];
    coinUsage: { date: string, amount: number }[];
    summary: { totalCoins: number, referralCount: number };
}

export default function DashboardPage() {
    const { sessions, isLoading, fetchSessions, updateSessionLocally } = useSessionStore();
    const { user, setUser } = useAuthStore();
    const { language } = useLocaleStore();
    const t = translations[language];
    const tr = (key: keyof typeof translations.en, vars?: Record<string, string | number>) => {
        const template = String(t[key] ?? translations.en[key] ?? "");
        if (!vars) return template;
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), template);
    };
    const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
    const [referralBonus, setReferralBonus] = useState(10);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const isMaintenanceError = (err: any) => err?.response?.status === 503 && err?.response?.data?.maintenance;

    useEffect(() => {
        fetchSessions();

        const fetchAnnouncements = async () => {
            try {
                const res = await api.get("/announcements");
                setAnnouncements(res.data.announcements);
            } catch (err) {
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch announcements:", err);
                }
            }
        };
        fetchAnnouncements();

        const fetchReferralInfo = async () => {
            try {
                const res = await api.get("/referral");
                setReferralBonus(res.data.referralBonus || 10);
            } catch (err) {
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch referral info:", err);
                }
            }
        };
        fetchReferralInfo();

        const fetchDashboardStats = async () => {
            try {
                const res = await api.get("/dashboard/stats");
                setStats(res.data);
            } catch (err) {
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch dashboard stats:", err);
                }
            } finally {
                setIsStatsLoading(false);
            }
        };
        fetchDashboardStats();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token: localStorage.getItem("token") }
        });

        socket.on("session_update", (data: { sessionId: string; status: string; isLive?: boolean }) => {
            updateSessionLocally(data.sessionId, { status: data.status, isLive: data.isLive });
        });

        socket.on("balance_update", (data: { coins: number }) => {
            if (user) {
                setUser({ ...user, coins: data.coins });
            }
        });
        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, updateSessionLocally]);

    const activeSessionsCount = sessions.filter(s => s.status === "active").length;

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const shortcuts = [
        { icon: CreditCard, label: t.shortcut_topup, path: "/dashboard/billing", color: "text-emerald-400", bg: "bg-emerald-400/10" },
        { icon: UserPlus, label: t.shortcut_refer, path: "/dashboard/referrals", color: "text-violet-400", bg: "bg-violet-400/10" },
        { icon: Rocket, label: t.shortcut_deploy, path: "/dashboard/deployments", color: "text-primary", bg: "bg-primary/10" },
        { icon: Bell, label: t.shortcut_alerts, path: "/dashboard/notifications", color: "text-orange-400", bg: "bg-orange-400/10" },
        { icon: Settings, label: t.shortcut_settings, path: "/dashboard/configurations", color: "text-blue-400", bg: "bg-blue-400/10" },
        { icon: History, label: t.shortcut_usage, path: "/dashboard/billing", color: "text-gray-400", bg: "bg-gray-400/10" },
    ];

    return (
        <DashboardLayout>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-8 max-w-7xl mx-auto"
            >
                {/* Modern Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <motion.div variants={itemVariants}>
                        <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                                <Activity className="h-8 w-8 text-primary" />
                            </div>
                            <span className="bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">{t.dashboard}</span>
                        </h1>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2 ml-1 opacity-70">
                            {t.dashboard_central_command}
                        </p>
                    </motion.div>

                    <motion.div variants={itemVariants} className="flex items-center gap-4 p-1.5 pr-6 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center font-black text-black">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">{t.welcome_back}</p>
                            <p className="text-sm font-black text-white uppercase tracking-tight">{user?.name || t.member}</p>
                        </div>
                    </motion.div>
                </div>

                <motion.div variants={itemVariants}>
                    <DailyCheckIn />
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: Coins, label: t.stat_coin_balance, value: user?.coins || 0, color: "text-yellow-500", detail: "🪙", pulse: true },
                        { icon: ShieldCheck, label: t.encryption, value: "AES-256", color: "text-sky-400", detail: "🔐" },
                        { icon: RefreshCcw, label: t.uptime, value: "99.9%", color: "text-emerald-400", detail: "⚡" },
                        { icon: Network, label: t.stat_active_bots, value: activeSessionsCount, color: "text-primary", detail: "🤖" },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            whileHover={{ scale: 1.02, y: -2 }}
                            className="p-6 rounded-3xl border border-white/10 bg-[#0A0A0A]/40 backdrop-blur-2xl relative overflow-hidden group"
                        >
                            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                                <stat.icon size={64} />
                            </div>
                            <stat.icon className={`h-5 w-5 ${stat.color} mb-4 ${stat.pulse ? 'animate-pulse' : ''}`} />
                            <div className="space-y-1 relative z-10">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{stat.label}</p>
                                <p className="text-2xl font-black text-white tracking-tight">
                                    {stat.value} <span className="text-sm opacity-50 ml-1">{stat.detail}</span>
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Interactive Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div variants={itemVariants} className="p-8 rounded-3xl border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-3xl min-h-[350px] relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">{t.referral_growth}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.last_7_days_activity}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                                <TrendingUp size={16} />
                            </div>
                        </div>

                        {isStatsLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats?.referralGrowth || []}>
                                        <defs>
                                            <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                        <XAxis dataKey="date" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                            itemStyle={{ color: '#8b5cf6', fontSize: '12px', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorRef)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </motion.div>

                    <motion.div variants={itemVariants} className="p-8 rounded-3xl border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-3xl min-h-[350px] relative overflow-hidden">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">{t.coin_purchase_trend}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.daily_investment_recap}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                <Coins size={16} />
                            </div>
                        </div>

                        {isStatsLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats?.coinUsage || []}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                        <XAxis dataKey="date" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                            itemStyle={{ color: '#00f2ff', fontSize: '12px', fontWeight: 'bold' }}
                                        />
                                        <Line type="stepAfter" dataKey="amount" stroke="#00f2ff" strokeWidth={3} dot={{ r: 4, fill: '#00f2ff' }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Quick Shortcuts */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h2 className="text-xs font-black text-white uppercase tracking-[0.3em] opacity-60">
                            {t.quick_commands}
                        </h2>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                        {shortcuts.map((s, i) => (
                            <Link key={i} href={s.path}>
                                <motion.div
                                    variants={itemVariants}
                                    whileHover={{ y: -5, scale: 1.02 }}
                                    className="p-4 rounded-2xl border border-white/5 bg-[#0D0D0D]/40 backdrop-blur-xl flex flex-col items-center text-center gap-3 group hover:bg-white/5 transition-colors"
                                >
                                    <div className={`p-3 rounded-xl ${s.bg} ${s.color} group-hover:scale-110 transition-transform`}>
                                        <s.icon size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">
                                        {s.label}
                                    </span>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
                    <div className="lg:col-span-2 space-y-8">
                        {/* Announcements Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2">
                                <Megaphone className="h-5 w-5 text-primary" />
                                <h2 className="text-lg font-black tracking-tight text-white uppercase">{t.broadcasts}</h2>
                            </div>
                            <div className="grid gap-4">
                                {announcements.length === 0 ? (
                                    <div className="p-8 text-center border border-white/5 rounded-3xl bg-white/5">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.no_active_broadcasts}</p>
                                    </div>
                                ) : announcements.map((announcement) => {
                                    const tc = typeConfig[announcement.type] || typeConfig.info;
                                    const Icon = tc.icon;
                                    return (
                                        <motion.div key={announcement._id} variants={itemVariants} className={`p-6 rounded-3xl border ${tc.border} bg-[#0D0D0D]/40 backdrop-blur-xl flex gap-5 items-start hover:bg-[#111] transition-colors group`}>
                                            <div className={`p-3.5 rounded-2xl bg-black/60 border ${tc.border} shrink-0 group-hover:scale-110 transition-transform`}>
                                                <Icon className={`w-5 h-5 ${tc.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-black text-white uppercase tracking-wide">{announcement.title}</h3>
                                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">{new Date(announcement.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[11px] text-white/60 font-medium leading-relaxed">{announcement.message}</p>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Quick Tip Premium */}
                        <motion.div
                            variants={itemVariants}
                            whileHover={{ scale: 1.01 }}
                            className="p-8 rounded-[2.5rem] border border-primary/20 bg-primary/5 space-y-6 relative overflow-hidden group"
                        >
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">{t.quick_tip}</h3>
                            </div>
                            <p className="text-xs text-white/80 font-medium leading-[1.8] relative z-10">
                                {tr("invite_friends_dynamic", { amount: referralBonus })}
                            </p>
                            <Button asChild variant="link" className="p-0 h-auto text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:gap-2 transition-all">
                                <Link href="/dashboard/referrals" className="flex items-center gap-2">
                                    {t.referrals} <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            </Button>
                        </motion.div>

                        <motion.div variants={itemVariants} className="p-8 rounded-[2.5rem] border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-xl group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                                    <Wrench className="h-5 w-5 text-gray-400" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">{t.support}</h3>
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] leading-relaxed mb-6">
                                {t.support_desc}
                            </p>
                            <div className="p-5 rounded-2xl bg-black/40 border border-white/5 text-center group-hover:border-emerald-500/20 transition-colors">
                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-1">{t.service_status}</p>
                                <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t.operational}
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </DashboardLayout>
    );
}

const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: "text-sky-400", bg: "bg-sky-500/5", border: "border-sky-500/10" },
    warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/10" },
    maintenance: { icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/10" },
    update: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/5", border: "border-violet-500/10" },
    promo: { icon: Tag, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/10" },
};
