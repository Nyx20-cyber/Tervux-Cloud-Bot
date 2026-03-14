"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { Megaphone, Loader2, Search, Send } from "lucide-react";
import { motion } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";

interface BroadcastSession {
    _id: string;
    phone?: string;
    status: "pairing" | "active" | "disconnected" | "paused" | "expired";
    isLive?: boolean;
    expiresAt?: string | null;
    settings?: Record<string, boolean | string>;
    userId?: { name?: string; email?: string };
}

export function BroadcastControl() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const [sessions, setSessions] = useState<BroadcastSession[]>([]);
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [scope, setScope] = useState<"all" | "selected">("all");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [result, setResult] = useState<null | {
        triggered: number;
        totalGroups: number;
        totalSent: number;
        totalFailed: number;
        totalSkipped: number;
    }>(null);

    const fetchSessions = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/sessions");
            const eligible = (res.data.sessions || []).filter((session: BroadcastSession) =>
                ["active", "paused"].includes(session.status) &&
                session.expiresAt &&
                new Date(session.expiresAt).getTime() > Date.now()
            );
            setSessions(eligible);
        } catch (err) {
            console.error(err);
            toast.error(t.admin_failed_fetch_sessions);
        } finally {
            setIsLoading(false);
        }
    }, [t.admin_failed_fetch_sessions]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const filteredSessions = useMemo(() => {
        return sessions.filter((session) =>
            (session.phone || "").includes(search) ||
            session.userId?.name?.toLowerCase().includes(search.toLowerCase()) ||
            session.userId?.email?.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, sessions]);

    const selectedCount = selectedIds.length;
    const allVisibleSelected = filteredSessions.length > 0 && filteredSessions.every((s) => selectedIds.includes(s._id));

    const toggleSession = (sessionId: string) => {
        setSelectedIds((prev) =>
            prev.includes(sessionId)
                ? prev.filter((id) => id !== sessionId)
                : [...prev, sessionId]
        );
        setScope("selected");
    };

    const toggleSelectAllVisible = () => {
        if (allVisibleSelected) {
            const visibleIds = new Set(filteredSessions.map((s) => s._id));
            setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
            return;
        }

        setSelectedIds((prev) => {
            const merged = new Set(prev);
            for (const session of filteredSessions) {
                merged.add(session._id);
            }
            return Array.from(merged);
        });
        setScope("selected");
    };

    const handleManualBroadcast = async () => {
        setIsSending(true);
        try {
            const payload = scope === "all"
                ? { targetAll: true }
                : { sessionIds: selectedIds };

            const res = await api.post("/admin/group-broadcast/manual", payload);
            setResult({
                triggered: res.data.triggered,
                totalGroups: res.data.totalGroups,
                totalSent: res.data.totalSent,
                totalFailed: res.data.totalFailed,
                totalSkipped: res.data.totalSkipped || 0
            });
            toast.success(t.admin_manual_broadcast_success);
            setConfirmOpen(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_manual_broadcast_failed);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-primary" />
                        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">
                            {t.admin_manual_broadcast_title}
                        </h2>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        {t.admin_manual_broadcast_desc}
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={isSending || (scope === "selected" && selectedCount === 0)}
                    className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 hover:text-white uppercase tracking-widest text-[10px] font-black"
                >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t.admin_trigger_broadcast_now}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                    onClick={() => setScope("all")}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                        scope === "all"
                            ? "border-primary/40 bg-primary/10"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">{t.admin_broadcast_target_all}</p>
                    <p className="mt-2 text-sm font-bold text-white">{sessions.length}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">{t.admin_broadcast_target_all_desc}</p>
                </button>

                <button
                    onClick={() => setScope("selected")}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                        scope === "selected"
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">{t.admin_broadcast_target_selected}</p>
                    <p className="mt-2 text-sm font-bold text-white">{selectedCount}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">{t.admin_broadcast_target_selected_desc}</p>
                </button>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.admin_broadcast_ready}</p>
                    <p className="mt-2 text-sm font-bold text-white">
                        {scope === "all" ? sessions.length : selectedCount}
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold">
                        {scope === "all" ? t.admin_broadcast_ready_all : t.admin_broadcast_ready_selected}
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t.admin_search_phone_or_user}
                            className="pl-10 bg-white/5 border-white/10 text-white"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={toggleSelectAllVisible}
                        className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white uppercase tracking-widest text-[10px] font-black"
                    >
                        {allVisibleSelected ? t.admin_unselect_visible : t.admin_select_visible}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {filteredSessions.map((session) => {
                            const checked = selectedIds.includes(session._id);
                            return (
                                <label
                                    key={session._id}
                                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                                        checked
                                            ? "border-primary/30 bg-primary/10"
                                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleSession(session._id)}
                                        className="h-4 w-4 accent-emerald-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white tracking-widest">{session.phone || "—"}</p>
                                        <p className="text-[10px] text-gray-500 font-semibold truncate">
                                            {session.userId?.name || session.userId?.email || t.admin_unknown_user}
                                        </p>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                                        session.settings?.groupPromotionBroadcast !== false
                                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                            : "border-red-500/20 bg-red-500/10 text-red-300"
                                    }`}>
                                        {session.settings?.groupPromotionBroadcast !== false ? t.admin_broadcast_on : t.admin_broadcast_off}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            {result && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                        {t.admin_broadcast_last_result}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm font-bold text-white">
                        <div>{t.admin_broadcast_triggered}: {result.triggered}</div>
                        <div>{t.admin_broadcast_groups}: {result.totalGroups}</div>
                        <div>{t.admin_broadcast_sent}: {result.totalSent}</div>
                        <div>{t.admin_broadcast_skipped}: {result.totalSkipped}</div>
                        <div>{t.admin_broadcast_failed}: {result.totalFailed}</div>
                    </div>
                </div>
            )}

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_manual_broadcast_confirm_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {scope === "all"
                                ? t.admin_manual_broadcast_confirm_all_desc
                                : t.admin_manual_broadcast_confirm_selected_desc.replace("{count}", String(selectedCount))}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isSending}
                            onClick={() => setConfirmOpen(false)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={isSending || (scope === "selected" && selectedCount === 0)}
                            onClick={handleManualBroadcast}
                            className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 hover:text-white"
                        >
                            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.confirm_action}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
