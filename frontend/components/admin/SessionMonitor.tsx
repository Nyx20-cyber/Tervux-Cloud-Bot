"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Wifi, Search, Loader2, Filter, Radio,
    Power, Smartphone, Pencil, Trash2, Megaphone
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";

interface SessionRecord {
    _id: string;
    userId?: { _id: string; email?: string; name?: string; phone?: string };
    phone: string;
    status: "pairing" | "active" | "disconnected" | "paused" | "expired";
    isLive: boolean;
    expiresAt?: string;
    lastConnected?: string;
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
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [sessions, setSessions] = useState<SessionRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [broadcastFilter, setBroadcastFilter] = useState<"all" | "on" | "off">("all");
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
    const [confirmDisconnectSessionId, setConfirmDisconnectSessionId] = useState<string | null>(null);
    const [confirmBroadcastToggle, setConfirmBroadcastToggle] = useState<{ sessionId: string; nextValue: boolean } | null>(null);
    const [editSession, setEditSession] = useState<SessionRecord | null>(null);
    const [editPhone, setEditPhone] = useState("");
    const [editStatus, setEditStatus] = useState<SessionRecord["status"]>("disconnected");
    const [editExpiresAt, setEditExpiresAt] = useState("");
    const [editGroupPromotionBroadcast, setEditGroupPromotionBroadcast] = useState(true);

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
            toast.error(t.admin_failed_fetch_sessions);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions(statusFilter);
    }, [fetchSessions, statusFilter]);

    // Live updates via socket.io (silent updates, no polling)
    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_session_updated", (payload: { sessionId: string; status?: SessionRecord["status"] }) => {
            if (!payload?.sessionId) return;
            if (payload.status) {
                setSessions(prev => prev.map(s =>
                    s._id === payload.sessionId ? { ...s, status: payload.status ?? s.status } : s
                ));
            } else {
                fetchSessions(statusFilter);
            }
        });

        socket.on("admin_session_deleted", (payload: { sessionId: string }) => {
            if (!payload?.sessionId) return;
            setSessions(prev => prev.filter(s => s._id !== payload.sessionId));
            setTotal(prev => Math.max(0, prev - 1));
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, statusFilter, token]);

    const handleDisconnect = async (sessionId: string) => {
        setActionLoading(sessionId);
        try {
            await api.post(`/admin/sessions/${sessionId}/disconnect`);
            setSessions(prev => prev.map(s =>
                s._id === sessionId ? { ...s, status: "disconnected" as const, isLive: false } : s
            ));
            toast.success(t.admin_session_disconnected);
        } catch (err) {
            toast.error(t.admin_failed_disconnect_session);
        } finally {
            setActionLoading(null);
            setConfirmDisconnectSessionId(null);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        setActionLoading(sessionId);
        try {
            await api.delete(`/admin/sessions/${sessionId}`);
            setSessions(prev => prev.filter(s => s._id !== sessionId));
            setTotal(prev => Math.max(0, prev - 1));
            toast.success(t.admin_session_deleted);
            setConfirmDeleteSessionId(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_delete_session);
        } finally {
            setActionLoading(null);
        }
    };

    const handleToggleGroupBroadcast = async (sessionId: string, nextValue: boolean) => {
        setActionLoading(sessionId);
        try {
            const res = await api.put(`/admin/sessions/${sessionId}`, {
                settings: {
                    groupPromotionBroadcast: nextValue
                }
            });
            const updated = res.data.session;
            setSessions(prev => prev.map(s =>
                s._id === sessionId
                    ? {
                        ...s,
                        ...updated,
                        _id: sessionId,
                        settings: {
                            ...(s.settings || {}),
                            ...(updated?.settings || {}),
                            groupPromotionBroadcast: nextValue
                        }
                    }
                    : s
            ));
            if (editSession?._id === sessionId) {
                setEditGroupPromotionBroadcast(nextValue);
            }
            toast.success(nextValue ? t.admin_group_broadcast_enabled : t.admin_group_broadcast_disabled);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_update_session);
        } finally {
            setActionLoading(null);
            setConfirmBroadcastToggle(null);
        }
    };

    const openEditModal = (session: SessionRecord) => {
        setEditSession(session);
        setEditPhone(session.phone || "");
        setEditStatus(session.status);
        setEditExpiresAt(
            session.expiresAt
                ? new Date(session.expiresAt).toISOString().slice(0, 16)
                : ""
        );
        setEditGroupPromotionBroadcast(session.settings?.groupPromotionBroadcast !== false);
    };

    const handleSaveEdit = async () => {
        if (!editSession) return;
        setActionLoading(editSession._id);
        try {
            const payload: Record<string, any> = {
                phone: editPhone,
                status: editStatus,
                settings: {
                    groupPromotionBroadcast: editGroupPromotionBroadcast
                }
            };
            payload.expiresAt = editExpiresAt ? new Date(editExpiresAt).toISOString() : null;

            const res = await api.put(`/admin/sessions/${editSession._id}`, payload);
            const updated = res.data.session;

            setSessions(prev => prev.map(s =>
                s._id === editSession._id
                    ? { ...s, ...updated, _id: editSession._id }
                    : s
            ));
            toast.success(t.admin_session_updated_successfully);
            setEditSession(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_update_session);
        } finally {
            setActionLoading(null);
        }
    };

    const filteredSessions = sessions.filter((s) => {
        const matchesSearch =
            s.phone.includes(search) ||
            s.userId?.email?.toLowerCase().includes(search.toLowerCase()) ||
            s.userId?.name?.toLowerCase().includes(search.toLowerCase());

        const broadcastEnabled = s.settings?.groupPromotionBroadcast !== false;
        const matchesBroadcast =
            broadcastFilter === "all" ||
            (broadcastFilter === "on" && broadcastEnabled) ||
            (broadcastFilter === "off" && !broadcastEnabled);

        return matchesSearch && matchesBroadcast;
    });

    const statuses = ["all", "active", "pairing", "paused", "disconnected", "expired"];

    const liveCount = sessions.filter(s => s.isLive).length;
    const activeCount = sessions.filter(s => s.status === "active").length;
    const broadcastOnCount = sessions.filter(s => s.settings?.groupPromotionBroadcast !== false).length;
    const broadcastOffCount = Math.max(0, sessions.length - broadcastOnCount);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-3 sm:space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Radio className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">{t.admin_session_monitor}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {total}
                    </span>
                </div>

                {/* Live summary pills */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{liveCount} {t.live_now}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/20 bg-sky-500/5">
                        <Wifi className="h-3 w-3 text-sky-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">{activeCount} {t.admin_active}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                        <Megaphone className="h-3 w-3 text-emerald-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">{broadcastOnCount} {t.admin_broadcast_on}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/5">
                        <Megaphone className="h-3 w-3 text-red-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-300">{broadcastOffCount} {t.admin_broadcast_off}</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder={t.admin_search_phone_or_user}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 backdrop-blur-md transition-all uppercase tracking-widest"
                    />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-gray-500 mr-1" />
                    {statuses.map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                                }`}
                        >
                            {t[`admin_status_${s}` as keyof typeof t] || s}
                        </button>
                    ))}
                    {(["all", "on", "off"] as const).map((s) => (
                        <button
                            key={`broadcast-${s}`}
                            onClick={() => setBroadcastFilter(s)}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${broadcastFilter === s
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                                }`}
                        >
                            {t[`admin_broadcast_${s}` as keyof typeof t] || s}
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
                        {search || statusFilter !== "all" ? t.admin_no_sessions_match_filters : t.admin_no_sessions_found}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                    <AnimatePresence>
                        {filteredSessions.map(session => {
                            const st = statusStyles[session.status] || statusStyles.disconnected;
                            const broadcastEnabled = session.settings?.groupPromotionBroadcast !== false;
                            return (
                                <motion.div
                                    key={session._id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3.5 sm:p-4 space-y-3 hover:bg-white/[0.06] transition-all group"
                                >
                                    {/* Top: Status + Live indicator */}
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${st.bg} ${st.text} border ${st.border} flex items-center gap-1.5`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                                            {t[`admin_status_${session.status}` as keyof typeof t] || session.status}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border flex items-center gap-1.5 ${broadcastEnabled
                                                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                                    : "bg-red-500/10 text-red-300 border-red-500/20"
                                                }`}>
                                                <Megaphone className="h-3 w-3" />
                                                {broadcastEnabled ? t.admin_broadcast_on : t.admin_broadcast_off}
                                            </span>
                                            {session.isLive && (
                                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                                    </span>
                                                    {t.live_now}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone + User */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                            <Smartphone className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white tracking-widest">{session.phone || t.unknown_phone}</p>
                                            <p className="text-[10px] text-gray-500 font-semibold truncate">
                                                {session.userId?.name || session.userId?.email || t.admin_unknown_user}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">{t.status_label}</p>
                                            <p className="font-black text-violet-400 tracking-widest">
                                                {t[`admin_status_${session.status}` as keyof typeof t] || session.status}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">{t.admin_expires}</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {session.expiresAt
                                                    ? format(new Date(session.expiresAt), "MMM dd, HH:mm")
                                                    : "—"
                                                }
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">{t.admin_last_online}</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {session.lastConnected
                                                    ? format(new Date(session.lastConnected), "MMM dd, HH:mm")
                                                    : "—"
                                                }
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-bold uppercase tracking-widest text-gray-600">{t.admin_created}</p>
                                            <p className="font-black text-gray-400 tracking-widest">
                                                {format(new Date(session.createdAt), "MMM dd")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-2 border-t border-white/5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        {actionLoading === session._id ? (
                                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => setConfirmBroadcastToggle({ sessionId: session._id, nextValue: !broadcastEnabled })}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${broadcastEnabled
                                                            ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                                                            : "bg-red-500/10 hover:bg-red-500/20 text-red-300"
                                                        }`}
                                                >
                                                    <Megaphone className="w-3 h-3" />
                                                    {broadcastEnabled ? t.admin_disable_broadcast : t.admin_enable_broadcast}
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(session)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                    {t.admin_edit}
                                                </button>
                                                {(session.status === "active" || session.isLive) && (
                                                    <button
                                                        onClick={() => setConfirmDisconnectSessionId(session._id)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        <Power className="w-3 h-3" />
                                                        {t.admin_force_disconnect}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setConfirmDeleteSessionId(session._id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    {t.delete}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            <Dialog open={!!confirmDisconnectSessionId} onOpenChange={(open) => !open && setConfirmDisconnectSessionId(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_disconnect_session_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {t.admin_confirm_disconnect_session}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!actionLoading}
                            onClick={() => setConfirmDisconnectSessionId(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!actionLoading || !confirmDisconnectSessionId}
                            onClick={() => confirmDisconnectSessionId && handleDisconnect(confirmDisconnectSessionId)}
                            className="bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                        >
                            {actionLoading && confirmDisconnectSessionId ? <Loader2 className="w-4 h-4 animate-spin" /> : t.admin_force_disconnect}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!confirmDeleteSessionId} onOpenChange={(open) => !open && setConfirmDeleteSessionId(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_delete_session_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {t.admin_confirm_delete_session}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!actionLoading}
                            onClick={() => setConfirmDeleteSessionId(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!actionLoading || !confirmDeleteSessionId}
                            onClick={() => confirmDeleteSessionId && handleDeleteSession(confirmDeleteSessionId)}
                            className="bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                        >
                            {actionLoading && confirmDeleteSessionId ? <Loader2 className="w-4 h-4 animate-spin" /> : t.delete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!confirmBroadcastToggle} onOpenChange={(open) => !open && setConfirmBroadcastToggle(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {confirmBroadcastToggle?.nextValue ? t.admin_enable_broadcast_title : t.admin_disable_broadcast_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {confirmBroadcastToggle?.nextValue ? t.admin_confirm_enable_broadcast_desc : t.admin_confirm_disable_broadcast_desc}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!actionLoading}
                            onClick={() => setConfirmBroadcastToggle(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!actionLoading || !confirmBroadcastToggle}
                            onClick={() =>
                                confirmBroadcastToggle &&
                                handleToggleGroupBroadcast(confirmBroadcastToggle.sessionId, confirmBroadcastToggle.nextValue)
                            }
                            className={confirmBroadcastToggle?.nextValue
                                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                : "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"}
                        >
                            {actionLoading && confirmBroadcastToggle ? <Loader2 className="w-4 h-4 animate-spin" /> : t.confirm_action}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editSession} onOpenChange={(open) => !open && setEditSession(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_edit_session_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {t.admin_edit_session_desc}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.phone_number}</label>
                            <Input
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.status_label}</label>
                            <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as SessionRecord["status"])}
                                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {["pairing", "active", "paused", "disconnected", "expired"].map((s) => (
                                    <option key={s} value={s} className="bg-[#0e0e0e] text-white">
                                        {t[`admin_status_${s}` as keyof typeof t] || s}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_expires}</label>
                            <Input
                                type="datetime-local"
                                value={editExpiresAt}
                                onChange={(e) => setEditExpiresAt(e.target.value)}
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2 block">
                                {t.admin_group_broadcast_control}
                            </label>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1.5">
                                <button
                                    type="button"
                                    onClick={() => setEditGroupPromotionBroadcast(true)}
                                    className={`flex-1 h-10 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                        editGroupPromotionBroadcast
                                            ? "bg-primary text-black"
                                            : "text-gray-500 hover:text-white"
                                    }`}
                                >
                                    ON
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditGroupPromotionBroadcast(false)}
                                    className={`flex-1 h-10 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                        !editGroupPromotionBroadcast
                                            ? "bg-red-500 text-white"
                                            : "text-gray-500 hover:text-white"
                                    }`}
                                >
                                    OFF
                                </button>
                            </div>
                            <p className="mt-2 text-[10px] font-semibold text-gray-500 leading-relaxed">
                                {t.admin_group_broadcast_control_desc}
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!actionLoading}
                            onClick={() => setEditSession(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!actionLoading || !editSession}
                            onClick={handleSaveEdit}
                            className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 hover:text-white"
                        >
                            {actionLoading && editSession ? <Loader2 className="w-4 h-4 animate-spin" /> : t.save}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
