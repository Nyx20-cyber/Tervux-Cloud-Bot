"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Coins, Search, Loader2, Plus, Minus, X, Send, ArrowUpRight, ArrowDownRight, Globe, Zap, CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface UserRecord {
    _id: string;
    email: string;
    name: string;
    phone: string;
    coins: number;
    role?: "user" | "admin";
}

type PendingCoinAction =
    | { type: "adjust"; userName: string; amount: number; mode: "add" | "remove" }
    | { type: "bonus"; amount: number; usersCount: number }
    | { type: "banner"; enabled: boolean };

export function CoinManagement() {
    const { language } = useLocaleStore();
    const currentUser = useAuthStore((state) => state.user);
    const token = useAuthStore((state) => state.token);
    const t = translations[language];
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
    const [amount, setAmount] = useState<number>(0);
    const [reason, setReason] = useState("");
    const [sending, setSending] = useState(false);
    const [mode, setMode] = useState<"add" | "remove">("add");

    // Global bonus state
    const [bonusAmount, setBonusAmount] = useState("");
    const [bonusReason, setBonusReason] = useState("");
    const [bonusMessage, setBonusMessage] = useState("");
    const [sendingBonus, setSendingBonus] = useState(false);
    const [bonusResult, setBonusResult] = useState<{ usersRewarded: number; totalCoinsDistributed: number } | null>(null);
    const [dailyClaimBannerEnabled, setDailyClaimBannerEnabled] = useState(true);
    const [savingBanner, setSavingBanner] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingCoinAction | null>(null);

    const fetchUsers = useCallback(async (searchTerm = "") => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ all: "true" });
            const trimmedSearch = searchTerm.trim();
            if (trimmedSearch) {
                params.set("search", trimmedSearch);
            }

            const res = await api.get(`/admin/users?${params.toString()}`);
            const fetchedUsers = Array.isArray(res.data.users) ? res.data.users : [];

            const mergedUsers = [...fetchedUsers];
            const shouldIncludeCurrentAdmin =
                currentUser?.role === "admin" &&
                !mergedUsers.some((user: UserRecord) => user._id === currentUser._id) &&
                (
                    !trimmedSearch ||
                    currentUser.name?.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
                    currentUser.email?.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
                    trimmedSearch.toLowerCase().includes("admin")
                );

            if (shouldIncludeCurrentAdmin) {
                mergedUsers.unshift({
                    _id: currentUser._id,
                    name: currentUser.name,
                    email: currentUser.email,
                    phone: currentUser.phone || "",
                    coins: currentUser.coins,
                    role: currentUser.role
                });
            }

            setUsers(mergedUsers);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            fetchUsers(search);
        }, 200);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [fetchUsers, search]);

    useEffect(() => {
        const fetchBannerSettings = async () => {
            try {
                const res = await api.get("/admin/settings");
                setDailyClaimBannerEnabled(res.data?.settings?.dailyClaimBannerEnabled !== false);
            } catch (error) {
                console.error("Failed to fetch coin banner settings:", error);
            }
        };

        fetchBannerSettings();
    }, []);

    useEffect(() => {
        if (!token) return;

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_settings_updated", (payload: { settings?: any }) => {
            if (!payload?.settings) return;
            setDailyClaimBannerEnabled(payload.settings.dailyClaimBannerEnabled !== false);
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    const saveDailyClaimBannerSettings = async () => {
        setSavingBanner(true);
        try {
            await api.put("/admin/settings", { dailyClaimBannerEnabled });
            toast.success(t.admin_banner_settings_saved);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t.admin_failed_save_banner_settings);
        } finally {
            setSavingBanner(false);
        }
    };

    const filteredUsers = users;

    const handleSubmit = async () => {
        if (!selectedUser || amount <= 0) {
            toast.error(t.admin_select_user_valid_amount);
            return;
        }
        setPendingAction({
            type: "adjust",
            userName: selectedUser.name || selectedUser.email || "User",
            amount,
            mode
        });
    };

    const performAdjustCoins = async () => {
        if (!selectedUser || amount <= 0) {
            toast.error(t.admin_select_user_valid_amount);
            return;
        }

        setSending(true);
        try {
            const adjustAmount = mode === "add" ? amount : -amount;
            const res = await api.post(`/admin/users/${selectedUser._id}/coins`, {
                amount: adjustAmount,
                reason: reason || `Admin ${mode === "add" ? "credit" : "debit"}`
            });
            setUsers(prev => prev.map(u =>
                u._id === selectedUser._id ? { ...u, coins: res.data.newBalance } : u
            ));
            setSelectedUser(prev => prev ? { ...prev, coins: res.data.newBalance } : null);
            toast.success(`${mode === "add" ? t.admin_added : t.admin_removed} ${amount} ${t.coins_word}. ${t.admin_new_balance}: ${res.data.newBalance}`);
            setAmount(0);
            setReason("");
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_adjust_coins);
        } finally {
            setSending(false);
        }
    };

    const totalCoins = users.reduce((sum, u) => sum + u.coins, 0);

    const handleBonusAll = async () => {
        const amt = Number(bonusAmount);
        if (!amt || amt <= 0) return toast.error(t.admin_enter_valid_coin_amount);
        if (!bonusReason.trim()) return toast.error(t.admin_provide_bonus_reason);
        setPendingAction({
            type: "bonus",
            amount: amt,
            usersCount: users.length
        });
    };

    const performBonusAll = async () => {
        const amt = Number(bonusAmount);
        if (!amt || amt <= 0) return toast.error(t.admin_enter_valid_coin_amount);
        if (!bonusReason.trim()) return toast.error(t.admin_provide_bonus_reason);

        setSendingBonus(true);
        setBonusResult(null);
        try {
            const res = await api.post("/admin/users/bonus-all", {
                amount: amt,
                reason: bonusReason,
                message: bonusMessage || undefined
            });
            setBonusResult(res.data);
            setBonusAmount("");
            setBonusReason("");
            setBonusMessage("");
            toast.success(`✅ ${res.data.usersRewarded} ${t.users} ${t.admin_received} +${amt} ${t.coins_word}!`);
            fetchUsers(search);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_distribute_bonus);
        } finally {
            setSendingBonus(false);
        }
    };

    const openDailyClaimBannerConfirm = () => {
        setPendingAction({
            type: "banner",
            enabled: dailyClaimBannerEnabled
        });
    };

    const runPendingAction = async () => {
        if (!pendingAction) return;

        if (pendingAction.type === "adjust") {
            await performAdjustCoins();
        }

        if (pendingAction.type === "bonus") {
            await performBonusAll();
        }

        if (pendingAction.type === "banner") {
            await saveDailyClaimBannerSettings();
        }

        setPendingAction(null);
    };

    const adjustActionDescription = pendingAction?.type === "adjust"
        ? language === "sw"
            ? `${pendingAction.mode === "add" ? t.admin_add : t.admin_remove} ${pendingAction.amount} ${t.coins_word} ${pendingAction.mode === "add" ? "kwa" : "kutoka kwa"} ${pendingAction.userName}?`
            : `${pendingAction.mode === "add" ? t.admin_add : t.admin_remove} ${pendingAction.amount} ${t.coins_word} ${pendingAction.mode === "add" ? "for" : "from"} ${pendingAction.userName}?`
        : "";

    const bannerActionDescription = pendingAction?.type === "banner"
        ? language === "sw"
            ? `${pendingAction.enabled ? "Onesha" : "Ficha"} ${t.admin_daily_claim_banner.toLowerCase()} kwenye dashboard sasa?`
            : `${pendingAction.enabled ? "Show" : "Hide"} ${t.admin_daily_claim_banner.toLowerCase()} on the dashboard now?`
        : "";

    return (
        <>
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3 sm:space-y-4"
        >
            {/* Global Bonus Banner */}
            <div className="rounded-xl sm:rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 via-emerald-900/20 to-emerald-950/60 p-4 sm:p-6 space-y-4 sm:space-y-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Globe className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-tight">{t.admin_give_bonus_all_users}</h3>
                        <p className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest">
                            {t.admin_give_bonus_all_users_desc}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">{t.admin_coins_per_user} *</label>
                        <div className="relative">
                            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                            <input
                                type="number"
                                min={1}
                                value={bonusAmount}
                                onChange={e => setBonusAmount(e.target.value)}
                                placeholder={t.admin_example_50}
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-emerald-500/20 bg-black/40 text-sm font-black text-emerald-400 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tracking-widest"
                            />
                        </div>
                        <div className="flex gap-1.5">
                            {[10, 25, 50, 100].map(v => (
                                <button key={v} onClick={() => setBonusAmount(String(v))}
                                    className="flex-1 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase text-gray-400 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all">
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">{t.admin_reason_shown_to_users} *</label>
                        <input
                            type="text"
                            value={bonusReason}
                            onChange={e => setBonusReason(e.target.value)}
                            placeholder={t.admin_bonus_reason_placeholder}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tracking-wide"
                        />
                    </div>

                    {/* Optional custom message */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">{t.admin_custom_notification_optional}</label>
                        <input
                            type="text"
                            value={bonusMessage}
                            onChange={e => setBonusMessage(e.target.value)}
                            placeholder={t.admin_leave_blank_default_message}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tracking-wide"
                        />
                    </div>
                </div>

                {/* Summary + Submit */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {bonusAmount && Number(bonusAmount) > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                            <Zap className="h-3 w-3" />
                            {Number(bonusAmount)} {t.coins_word} × {users.length} {t.users} = {Number(bonusAmount) * users.length} {t.admin_total_coins}
                        </div>
                    )}
                    <button
                        onClick={handleBonusAll}
                        disabled={sendingBonus || !bonusAmount || !bonusReason.trim()}
                        className="sm:ml-auto flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                    >
                        {sendingBonus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        {sendingBonus ? t.admin_distributing : t.admin_give_bonus_all}
                    </button>
                </div>

                {/* Success result */}
                {bonusResult && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-white">
                                ✅ {bonusResult.usersRewarded} {t.users} {t.admin_each_received} {bonusResult.totalCoinsDistributed / bonusResult.usersRewarded} {t.coins_word}
                            </p>
                            <p className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest">
                                {bonusResult.totalCoinsDistributed} {t.admin_total_coins_distributed} · {t.admin_all_users_notified}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">{t.coins_mgmt}</h2>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                    <Coins className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">
                        {totalCoins.toLocaleString()} {t.admin_total_coins_in_circulation}
                    </span>
                </div>
            </div>

            <div className="rounded-xl sm:rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 sm:p-5 backdrop-blur-xl">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-yellow-400">
                            <Coins className="h-3.5 w-3.5" />
                            {t.admin_daily_claim_banner}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">{t.admin_daily_claim_banner_desc}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 min-w-[220px]">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">{t.admin_daily_claim_banner}</p>
                                <p className="mt-1 text-[10px] font-semibold text-gray-400">
                                    {dailyClaimBannerEnabled ? t.admin_active : t.admin_hidden}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDailyClaimBannerEnabled((prev) => !prev)}
                                className={`w-10 h-5 rounded-full transition-all relative ${dailyClaimBannerEnabled ? "bg-emerald-500/40" : "bg-white/10"}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${dailyClaimBannerEnabled ? "right-1 bg-emerald-400" : "left-1 bg-gray-500"}`} />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={openDailyClaimBannerConfirm}
                            disabled={savingBanner}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                            {savingBanner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                            {t.admin_save_banner_settings}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                {/* User List */}
                <div className="lg:col-span-2 rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
                    {/* Search */}
                    <div className="p-4 border-b border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder={t.admin_search_users}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 backdrop-blur-md transition-all uppercase tracking-widest"
                            />
                        </div>
                    </div>

                    {/* User rows */}
                    {isLoading ? (
                        <div className="flex justify-center p-10">
                            <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
                        </div>
                    ) : (
                        <div className="max-h-[400px] overflow-y-auto no-scrollbar divide-y divide-white/5">
                            {filteredUsers.map(user => (
                                <button
                                    key={user._id}
                                    onClick={() => setSelectedUser(user)}
                                    className={`w-full flex items-center justify-between px-5 py-3.5 transition-all text-left ${selectedUser?._id === user._id
                                        ? "bg-yellow-500/10 border-l-2 border-yellow-500"
                                        : "hover:bg-white/[0.04] border-l-2 border-transparent"
                                        }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-white tracking-wide truncate">{user.name || "—"}</p>
                                        <p className="text-[10px] text-gray-500 font-semibold truncate">{user.email}</p>
                                    </div>
                                    <div className="flex items-center gap-1 ml-3">
                                        <Coins className="h-3 w-3 text-yellow-500" />
                                        <span className="text-sm font-black text-yellow-500 tracking-widest">{user.coins}</span>
                                    </div>
                                </button>
                            ))}
                            {filteredUsers.length === 0 && (
                                <div className="p-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                    {t.admin_no_users_found}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Adjustment Panel */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 space-y-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">{t.admin_adjust_coins}</h3>

                    {selectedUser ? (
                        <div className="space-y-4">
                            {/* Selected user info */}
                            <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 space-y-1">
                                <p className="text-xs font-bold text-white tracking-wide">{selectedUser.name || "—"}</p>
                                <p className="text-[10px] text-gray-500 font-semibold">{selectedUser.email}</p>
                                <div className="flex items-center gap-1 mt-2">
                                    <Coins className="h-4 w-4 text-yellow-500" />
                                    <span className="text-lg font-black text-yellow-500 tracking-widest">{selectedUser.coins}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 ml-1">{t.coins_word}</span>
                                </div>
                            </div>

                            {/* Mode toggle */}
                            <div className="flex rounded-xl border border-white/10 overflow-hidden">
                                <button
                                    onClick={() => setMode("add")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${mode === "add"
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-white/5 text-gray-500 hover:bg-white/10"
                                        }`}
                                >
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                    {t.admin_add}
                                </button>
                                <button
                                    onClick={() => setMode("remove")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${mode === "remove"
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-white/5 text-gray-500 hover:bg-white/10"
                                        }`}
                                >
                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                    {t.admin_remove}
                                </button>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_amount}</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={amount || ""}
                                    onChange={e => setAmount(Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-black text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 tracking-widest text-center"
                                />
                            </div>

                            {/* Quick amounts */}
                            <div className="flex gap-1.5">
                                {[10, 50, 100, 500].map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setAmount(v)}
                                        className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_reason_optional}</label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder={t.admin_bonus_refund_placeholder}
                                    className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 tracking-widest"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={sending || amount <= 0}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${mode === "add"
                                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
                                    : "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
                                    }`}
                            >
                                {sending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                                {mode === "add" ? `${t.admin_add} ${amount} ${t.coins_word}` : `${t.admin_remove} ${amount} ${t.coins_word}`}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                            <Coins className="h-8 w-8 text-gray-700" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                {t.admin_select_user_manage_coins}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
        <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
            <AlertDialogContent className={`rounded-[2rem] text-white ${
                pendingAction?.type === "adjust" && pendingAction?.mode === "remove"
                    ? "border-red-500/20 bg-[#12090a]"
                    : pendingAction?.type === "adjust"
                        ? "border-emerald-500/20 bg-[#09120d]"
                        : pendingAction?.type === "bonus"
                            ? "border-emerald-500/20 bg-[#09120d]"
                            : "border-amber-500/20 bg-[#120f09]"
            }`}>
                <AlertDialogHeader>
                    <AlertDialogMedia className={
                        pendingAction?.type === "adjust" && pendingAction?.mode === "remove"
                            ? "bg-red-500/15 text-red-300 border border-red-500/20"
                            : pendingAction?.type === "adjust"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                : pendingAction?.type === "bonus"
                                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                    : "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                    }>
                        <Coins className="w-8 h-8" />
                    </AlertDialogMedia>
                    <AlertDialogTitle className="text-base font-black uppercase tracking-widest">
                        {pendingAction?.type === "adjust"
                            ? `${pendingAction.mode === "add" ? t.admin_add : t.admin_remove} ${t.coins_word}`
                            : pendingAction?.type === "bonus"
                                ? t.admin_give_bonus_all
                                : t.admin_save_banner_settings}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-gray-300 leading-relaxed">
                        {pendingAction?.type === "adjust"
                            ? adjustActionDescription
                            : pendingAction?.type === "bonus"
                                ? `${t.admin_confirm_give_bonus_prefix} +${pendingAction.amount} ${t.coins_word} ${t.admin_confirm_give_bonus_suffix}`
                                : bannerActionDescription}
                    </AlertDialogDescription>
                    {pendingAction?.type === "bonus" && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.users}</p>
                            <p className="mt-1 text-sm font-semibold text-white">
                                {pendingAction.usersCount} {t.users} · +{pendingAction.amount} {t.coins_word}
                            </p>
                        </div>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-2xl border-white/10 bg-white/5 text-gray-200">
                        {t.cancel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={runPendingAction}
                        className={`rounded-2xl ${
                            pendingAction?.type === "adjust" && pendingAction?.mode === "remove"
                                ? "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                                : pendingAction?.type === "adjust"
                                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                    : pendingAction?.type === "bonus"
                                        ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                        : "bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 hover:text-white"
                        }`}
                    >
                        {t.confirm}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
