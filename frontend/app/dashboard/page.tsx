"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Activity, ShieldCheck, RefreshCcw, Network, PauseCircle, PlayCircle, Trash2, Coins, Rocket } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/store/useAuthStore";
import { ChevronRight, Megaphone, Info, AlertTriangle, Wrench, Sparkles, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AnnouncementRecord {
    _id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "maintenance" | "update" | "promo";
    isActive: boolean;
    createdBy?: { name?: string };
    createdAt: string;
}

const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: "text-sky-400", bg: "bg-sky-500/20", border: "border-sky-500/30" },
    warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30" },
    maintenance: { icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/30" },
    update: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/20", border: "border-violet-500/30" },
    promo: { icon: Tag, color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
};

export default function DashboardPage() {
    const { sessions, isLoading, fetchSessions, updateSessionLocally } = useSessionStore();
    const { user, checkAuth } = useAuthStore();
    const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);

    useEffect(() => {
        fetchSessions();

        // Fetch active announcements
        const fetchAnnouncements = async () => {
            try {
                const res = await api.get("/announcements");
                setAnnouncements(res.data.announcements);
            } catch (err) {
                console.error("Failed to fetch announcements:", err);
            }
        };
        fetchAnnouncements();

        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const socket = io(backendUrl, {
            auth: { token: localStorage.getItem("token") }
        });

        socket.on("session_update", (data: { sessionId: string; status: string }) => {
            updateSessionLocally(data.sessionId, { status: data.status });
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, updateSessionLocally]);

    const activeSessionsCount = sessions.filter(s => s.status === "active").length;

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                        <Activity className="h-8 w-8 text-primary" />
                        Dashboard Overview
                    </h1>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Manage your WhatsApp connections</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex flex-col items-center text-center space-y-1 hover:bg-yellow-500/20 transition-colors cursor-default backdrop-blur-md">
                        <Coins className="h-4 w-4 text-yellow-500 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-yellow-500/70">Coin Balance 🪙</p>
                        <p className="text-xs font-bold text-yellow-500 tracking-widest">{user?.coins || 0}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default backdrop-blur-md">
                        <ShieldCheck className="h-4 w-4 text-gray-400 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Encryption</p>
                        <p className="text-xs font-semibold text-white tracking-widest">AES-256</p>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default backdrop-blur-md">
                        <RefreshCcw className="h-4 w-4 text-gray-400 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Uptime</p>
                        <p className="text-xs font-semibold text-white tracking-widest">99.9%</p>
                    </div>
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-1 hover:bg-primary/10 transition-colors cursor-default backdrop-blur-md">
                        <Network className="h-4 w-4 text-primary mb-1 animate-pulse" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-primary/70">Connected Devices</p>
                        <p className="text-xs font-bold text-primary tracking-widest">{activeSessionsCount}</p>
                    </div>
                </div>

                {/* Announcements Section */}
                <AnimatePresence>
                    {announcements.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Megaphone className="h-5 w-5 text-primary" />
                                <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Announcements</h2>
                            </div>
                            <div className="grid gap-4">
                                {announcements.map((announcement, idx) => {
                                    const tc = typeConfig[announcement.type] || typeConfig.info;
                                    const Icon = tc.icon;
                                    return (
                                        <motion.div
                                            key={announcement._id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className={`p-4 rounded-2xl border ${tc.border} ${tc.bg} backdrop-blur-md flex gap-4 items-start`}
                                        >
                                            <div className={`p-2 rounded-xl bg-black/20 border ${tc.border} shrink-0`}>
                                                <Icon className={`w-5 h-5 ${tc.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-sm font-bold text-white tracking-wide">{announcement.title}</h3>
                                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                        {format(new Date(announcement.createdAt), "MMM dd")}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/70 font-medium leading-relaxed">
                                                    {announcement.message}
                                                </p>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Deployed Sessions Summary */}
                <div className="space-y-4 pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold tracking-tight text-white uppercase flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-primary" />
                            Deployed Bots
                        </h2>
                        <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest">
                            <Link href="/dashboard/deployments">
                                Manage Deployments <ChevronRight className="w-4 h-4 ml-2" />
                            </Link>
                        </Button>
                    </div>

                    {isLoading && sessions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest border border-white/10 border-dashed rounded-xl bg-white/5">
                            Loading active bots...
                        </div>
                    ) : sessions.filter(s => !!s.expiresAt).length === 0 ? (
                        <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5 flex flex-col items-center space-y-3">
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest text-center">No bots are currently deployed.</p>
                            <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest text-center max-w-sm">
                                Go to the Deployments page to use your coins 🪙 and activate a paired device.
                            </p>
                            <Button asChild variant="outline" className="mt-2 border-primary/50 text-white hover:text-black hover:bg-primary uppercase tracking-widest text-[10px]">
                                <Link href="/dashboard/deployments">View All Devices</Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {sessions
                                .filter(s => !!s.expiresAt)
                                .map(session => (
                                    <div key={session._id} className="p-5 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-between backdrop-blur-md transition-all hover:bg-white/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                                                <Network className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white tracking-widest">{session.phone || 'Unknown'}</p>
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-primary">Deployed</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-2 w-2 relative">
                                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${session.status === 'active' ? 'bg-primary' : session.status === 'paused' ? 'bg-amber-500' : 'bg-destructive'}`}></span>
                                                <span className={`relative inline-flex rounded-full h-2 w-2 ${session.status === 'active' ? 'bg-primary' : session.status === 'paused' ? 'bg-amber-500' : 'bg-destructive'}`}></span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout >
    );
}
