"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Wifi, WifiOff, Search, Loader2, Filter, Radio,
    Pause, Power, Clock, Smartphone
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface SessionRecord {
    _id: string;
    userId?: { _id: string; email?: string; name?: string; phone?: string };
    phone: string;
    status: "pairing" | "active" | "disconnected" | "paused" | "expired";
    isLive: boolean;
    expiresAt?: string;
    lastConnected?: string;
    subscription?: {
        planId?: { name?: string; price?: number };
        status: string;
        activatedAt?: string;
        expiresAt?: string;
    };
    settings?: Record<string, boolean | string>;
    createdAt: string;
}

const statusStyles: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    active: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" },
    pairing: { bg: "bg-sky-500/20", text: "text-sky-400", border: "border-sky-500/30", dot: "bg-sky-400" },
    paused: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400" },
    disconnected: { bg: "bg-gray-500/20", text: "text-gray-400", border: "border-gray-500/30", dot: "bg-gray-500" },
    expired: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-500" },
};

export function SessionMonitor() {
    const [sessions, setSessions] = useState<SessionRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchSessions = useCallback(async (status?: string) => {
        setIsLoading(true);
        try {
            let url = "/admin/sessions";
            if (status && status !== "all") url += `?status=${status}`;
            const res = await api.get(url);
            setSessions(res.data.sessions);
            setTotal(res.data.total);
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch sessions");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions(statusFilter);
    }, [fetchSessions, statusFilter]);

    // Auto-refresh every 15s
    useEffect(() => {
        const interval = setInterval(() => fetchSessions(statusFilter), 15000);
        return () => clearInterval(interval);
    }, [fetchSessions, statusFilter]);

    const handleDisconnect = async (sessionId: string) => {
        setActionLoading(sessionId);
        try {
            await api.post(`/admin/sessions/${sessionId}/disconnect`);
            setSessions(prev => prev.map(s =>
                s._id === sessionId ? { ...s, status: "disconnected" as const, isLive: false } : s
            ));
            toast.success("Session disconnected");
        } catch (err) {
            toast.error("Failed to disconnect session");
        } finally {
            setActionLoading(null);
        }
    };

    const filteredSessions = sessions.filter(s =>
        s.phone.includes(search) ||
        s.userId?.email?.toLowerCase().includes(search.toLowerCase()) ||
        s.userId?.name?.toLowerCase().includes(search.toLowerCase())
    );

    const statuses = ["all", "active", "pairing", "paused", "disconnected", "expired"];

    const liveCount = sessions.filter(s => s.isLive).length;
    const activeCount = sessions.filter(s => s.status === "active").length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Radio className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Session Monitor</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {total}
                    </span>
                </div>

                {/* Live summary pills */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{liveCount} Live</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/20 bg-sky-500/5">
                        <Wifi className="h-3 w-3 text-sky-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">{activeCount} Active</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search phone or user..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 backdrop-blur-md transition-all uppercase tracking-widest"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-gray-500 mr-1" />
                    {statuses.map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Session Cards */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : filteredSessions.length === 0 ? (
                <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                        {search || statusFilter !== "all" ? "No sessions match your filters" : "No sessions found"}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <AnimatePresence>
                        {filteredSessions.map(session => {
                            const st = statusStyles[session.status] || statusStyles.disconnected;
                            return (
                                <motion.div
                                    key={session._id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 space-y-3 hover:bg-white/[0.06] transition-all group"
                                >
                                    {/* Top: Status + Live indicator */}
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${st.bg} ${st.text} border ${st.border} flex items-center gap-1.5`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                                            {session.status}
                                        </span>
                                        {session.isLive && (
                                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                                </span>
                                                Live
                                            </span>
                                        )}
                                    </div>

                                    {/* Phone + User */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                            <Smartphone className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white tracking-widest">{session.phone || "Unknown"}</p>
                                            <p className="text-[10px] text-gray-500 font-semibold truncate">
                                                {session.userId?.name || session.userId?.email || "Unknown user"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">Plan</p>
                                            <p className="font-black text-violet-400 tracking-widest">
                                                {session.subscription?.planId?.name || "None"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">Expires</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {session.expiresAt
                                                    ? format(new Date(session.expiresAt), "MMM dd, HH:mm")
                                                    : "—"
                                                }
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">Last Online</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {session.lastConnected
                                                    ? format(new Date(session.lastConnected), "MMM dd, HH:mm")
                                                    : "—"
                                                }
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">Created</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {format(new Date(session.createdAt), "MMM dd")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {(session.status === "active" || session.isLive) && (
                                        <div className="pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {actionLoading === session._id ? (
                                                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                                            ) : (
                                                <button
                                                    onClick={() => handleDisconnect(session._id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    <Power className="w-3 h-3" />
                                                    Force Disconnect
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
    );
}
