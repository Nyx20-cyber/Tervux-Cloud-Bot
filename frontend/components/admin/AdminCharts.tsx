"use client";

import { useMemo } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3 } from "lucide-react";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

interface Payment {
    _id: string;
    amount: number;
    status: string;
    createdAt: string;
    userId?: { email?: string; name?: string };
    planId?: { name?: string; price?: number };
    transactionId?: string;
    sessionId?: any;
}

interface AdminChartsProps {
    recentPayments: Payment[];
    stats: {
        totalUsers: number;
        activeSubscriptions: number;
        totalSessions: number;
        activeSessions: number;
        liveConnections: number;
        totalRevenue: number;
    } | null;
}

const CustomTooltip = ({ active, payload, label, language }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl p-3 shadow-2xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} className="text-xs font-black tracking-widest" style={{ color: entry.color }}>
                        {entry.value.toLocaleString()} TZS
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export function AdminCharts({ recentPayments, stats }: AdminChartsProps) {
    const { language } = useLocaleStore();
    const t = translations[language];

    // Aggregate payments by day for the area chart
    const revenueByDay = useMemo(() => {
        const map = new Map<string, number>();
        recentPayments.forEach(p => {
            const day = new Date(p.createdAt).toLocaleDateString(language === "sw" ? "sw-TZ" : "en-US", { month: "short", day: "numeric" });
            map.set(day, (map.get(day) || 0) + p.amount);
        });
        return Array.from(map.entries()).map(([day, amount]) => ({ day, amount }));
    }, [recentPayments, language]);

    // Bar chart data from stats
    const barData = useMemo(() => {
        if (!stats) return [];
        return [
            { name: t.users, value: stats.totalUsers, color: "#8b5cf6" },
            { name: t.active_subs, value: stats.activeSubscriptions, color: "#10b981" },
            { name: t.deployments, value: stats.totalSessions, color: "#0ea5e9" },
            { name: t.active_sessions, value: stats.activeSessions, color: "#f59e0b" },
            { name: t.live_now, value: stats.liveConnections, color: "#25D366" },
        ];
    }, [stats, t]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Revenue Area Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-2xl sm:rounded-[2.5rem] border border-white/5 bg-black/40 backdrop-blur-2xl p-4 sm:p-8 space-y-4 sm:space-y-6 overflow-hidden relative group"
            >
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/50">{t.revenue_trend}</h3>
                    </div>
                </div>
                {revenueByDay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={revenueByDay}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis
                                dataKey="day"
                                tick={{ fontSize: 9, fill: "#4b5563", fontWeight: 800 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tick={{ fontSize: 9, fill: "#4b5563", fontWeight: 800 }}
                                axisLine={false}
                                tickLine={false}
                                width={50}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                            />
                            <Tooltip content={<CustomTooltip language={language} />} />
                            <Area
                                type="monotone"
                                dataKey="amount"
                                stroke="#25D366"
                                strokeWidth={3}
                                fill="url(#revenueGradient)"
                                animationDuration={1500}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[240px] space-y-4">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 opacity-20">
                            <TrendingUp className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">{t.no_revenue_data}</p>
                    </div>
                )}
            </motion.div>

            {/* Platform Stats Bar Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-2xl sm:rounded-[2.5rem] border border-white/5 bg-black/40 backdrop-blur-2xl p-4 sm:p-8 space-y-4 sm:space-y-6 overflow-hidden relative group"
            >
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
                            <BarChart3 className="h-4 w-4 text-violet-400" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/50">{t.platform_overview}</h3>
                    </div>
                </div>
                {barData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 8, fill: "#4b5563", fontWeight: 800 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tick={{ fontSize: 9, fill: "#4b5563", fontWeight: 800 }}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                                contentStyle={{
                                    background: "rgba(0,0,0,0.85)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "16px",
                                    backdropFilter: "blur(20px)",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    padding: "12px"
                                }}
                                itemStyle={{ color: "#fff", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.05em" }}
                                labelStyle={{ color: "#25D366", marginBottom: "4px", fontSize: "9px" }}
                            />
                            <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={32}>
                                {barData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[240px] space-y-4">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 opacity-20">
                            <BarChart3 className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">{t.no_data_available}</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
