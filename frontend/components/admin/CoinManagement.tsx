"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Coins, Search, Loader2, Plus, Minus, X, Send, ArrowUpRight, ArrowDownRight, Globe, Zap, CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface UserRecord {
    _id: string;
    email: string;
    name: string;
    phone: string;
    coins: number;
}

export function CoinManagement() {
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

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/users?limit=100");
            setUsers(res.data.users);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search)
    );

    const handleSubmit = async () => {
        if (!selectedUser || amount <= 0) {
            toast.error("Select a user and enter a valid amount");
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
            toast.success(`${mode === "add" ? "Added" : "Removed"} ${amount} coins. New balance: ${res.data.newBalance}`);
            setAmount(0);
            setReason("");
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to adjust coins");
        } finally {
            setSending(false);
        }
    };

    const totalCoins = users.reduce((sum, u) => sum + u.coins, 0);

    const handleBonusAll = async () => {
        const amt = Number(bonusAmount);
        if (!amt || amt <= 0) return toast.error("Enter a valid coin amount");
        if (!bonusReason.trim()) return toast.error("Please provide a reason for the bonus");
        if (!confirm(`Give +${amt} coins to ALL users? This cannot be undone.`)) return;
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
            toast.success(`✅ ${res.data.usersRewarded} users received +${amt} coins!`);
            fetchUsers();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to distribute bonus");
        } finally {
            setSendingBonus(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
        >
            {/* Global Bonus Banner */}
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 via-emerald-900/20 to-emerald-950/60 p-6 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Globe className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-tight">Give Bonus to All Users</h3>
                        <p className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest">
                            Distributes coins to every registered user + sends each a notification
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Coins per User *</label>
                        <div className="relative">
                            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                            <input
                                type="number"
                                min={1}
                                value={bonusAmount}
                                onChange={e => setBonusAmount(e.target.value)}
                                placeholder="e.g. 50"
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
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Reason * (shown to users)</label>
                        <input
                            type="text"
                            value={bonusReason}
                            onChange={e => setBonusReason(e.target.value)}
                            placeholder="e.g. Platform launch bonus, Holiday gift..."
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tracking-wide"
                        />
                    </div>

                    {/* Optional custom message */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Custom Notification Message (optional)</label>
                        <input
                            type="text"
                            value={bonusMessage}
                            onChange={e => setBonusMessage(e.target.value)}
                            placeholder="Leave blank for default message..."
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/40 text-xs font-bold text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tracking-wide"
                        />
                    </div>
                </div>

                {/* Summary + Submit */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {bonusAmount && Number(bonusAmount) > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                            <Zap className="h-3 w-3" />
                            {Number(bonusAmount)} coins × {users.length} users = {Number(bonusAmount) * users.length} total coins
                        </div>
                    )}
                    <button
                        onClick={handleBonusAll}
                        disabled={sendingBonus || !bonusAmount || !bonusReason.trim()}
                        className="sm:ml-auto flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                    >
                        {sendingBonus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        {sendingBonus ? "Distributing..." : "Give Bonus to All"}
                    </button>
                </div>

                {/* Success result */}
                {bonusResult && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-white">
                                ✅ {bonusResult.usersRewarded} users each received {bonusResult.totalCoinsDistributed / bonusResult.usersRewarded} coins
                            </p>
                            <p className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest">
                                {bonusResult.totalCoinsDistributed} total coins distributed · All users notified
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Coin Management</h2>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                    <Coins className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">
                        {totalCoins.toLocaleString()} Total Coins in Circulation
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* User List */}
                <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
                    {/* Search */}
                    <div className="p-4 border-b border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search users..."
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
                                    No users found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Adjustment Panel */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 space-y-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Adjust Coins</h3>

                    {selectedUser ? (
                        <div className="space-y-4">
                            {/* Selected user info */}
                            <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 space-y-1">
                                <p className="text-xs font-bold text-white tracking-wide">{selectedUser.name || "—"}</p>
                                <p className="text-[10px] text-gray-500 font-semibold">{selectedUser.email}</p>
                                <div className="flex items-center gap-1 mt-2">
                                    <Coins className="h-4 w-4 text-yellow-500" />
                                    <span className="text-lg font-black text-yellow-500 tracking-widest">{selectedUser.coins}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 ml-1">coins</span>
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
                                    Add
                                </button>
                                <button
                                    onClick={() => setMode("remove")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${mode === "remove"
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-white/5 text-gray-500 hover:bg-white/10"
                                        }`}
                                >
                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                    Remove
                                </button>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Amount</label>
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
                                <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Reason (optional)</label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="e.g. Bonus, Refund..."
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
                                {mode === "add" ? `Add ${amount} Coins` : `Remove ${amount} Coins`}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                            <Coins className="h-8 w-8 text-gray-700" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                Select a user from the list to manage their coins
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
