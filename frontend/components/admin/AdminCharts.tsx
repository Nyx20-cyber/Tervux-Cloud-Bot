"use client";

import { useMemo } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3 } from "lucide-react";

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

const CustomTooltip = ({ active, payload, label }: any) => {
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
    // Aggregate payments by day for the area chart
    const revenueByDay = useMemo(() => {
        const map = new Map<string, number>();
        recentPayments.forEach(p => {
            const day = new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            map.set(day, (map.get(day) || 0) + p.amount);
        });
        return Array.from(map.entries()).map(([day, amount]) => ({ day, amount }));
    }, [recentPayments]);

    // Bar chart data from stats
    const barData = useMemo(() => {
        if (!stats) return [];
        return [
            { name: "Users", value: stats.totalUsers, color: "#8b5cf6" },
            { name: "Active Subs", value: stats.activeSubscriptions, color: "#10b981" },
            { name: "Devices", value: stats.totalSessions, color: "#0ea5e9" },
            { name: "Active", value: stats.activeSessions, color: "#f59e0b" },
            { name: "Live", value: stats.liveConnections, color: "#25D366" },
        ];
    }, [stats]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Area Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4"
            >
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Revenue Trend</h3>
                </div>
                {revenueByDay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={revenueByDay}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="day"
                                tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                                width={60}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="amount"
                                stroke="#25D366"
                                strokeWidth={2}
                                fill="url(#revenueGradient)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-[220px]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">No revenue data yet</p>
                    </div>
                )}
            </motion.div>

            {/* Platform Stats Bar Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4"
            >
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Platform Overview</h3>
                </div>
                {barData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={barData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 9, fill: "#6b7280", fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "rgba(0,0,0,0.85)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "12px",
                                    backdropFilter: "blur(20px)",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                }}
                                labelStyle={{ color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "9px" }}
                            />
                            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                {barData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-[220px]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">No data available</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
