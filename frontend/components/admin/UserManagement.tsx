"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import { Search, Ban, ShieldCheck, Clock, ChevronLeft, ChevronRight, Loader2, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface UserRecord {
    _id: string;
    email: string;
    name: string;
    phone: string;
    role: "user" | "admin";
    coins: number;
    isBanned: boolean;
    createdAt: string;
    subscription?: {
        status: string;
        planId?: { name?: string; price?: number; durationDays?: number };
        expiresAt?: string;
    };
}

export function UserManagement() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchUsers = useCallback(async (p: number) => {
        setIsLoading(true);
        try {
            const res = await api.get(`/admin/users?page=${p}&limit=10`);
            setUsers(res.data.users);
            setTotal(res.data.total);
            setPages(res.data.pages);
            setPage(res.data.page);
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch users");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers(1);
    }, [fetchUsers]);

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search)
    );

    const handleBan = async (userId: string, isBanned: boolean) => {
        setActionLoading(userId);
        try {
            await api.put(`/admin/users/${userId}`, { isBanned: !isBanned });
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, isBanned: !isBanned } : u));
            toast.success(isBanned ? "User unbanned" : "User banned");
        } catch (err) {
            toast.error("Action failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleExtend = async (userId: string) => {
        setActionLoading(userId);
        try {
            const res = await api.put(`/admin/users/${userId}`, { subscriptionExtendDays: 30 });
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, ...res.data.user } : u));
            toast.success("Extended subscription by 30 days");
        } catch (err) {
            toast.error("Extension failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleToggleRole = async (userId: string, currentRole: string) => {
        const newRole = currentRole === "admin" ? "user" : "admin";
        setActionLoading(userId);
        try {
            await api.put(`/admin/users/${userId}`, { role: newRole });
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole as "user" | "admin" } : u));
            toast.success(`Role changed to ${newRole}`);
        } catch (err) {
            toast.error("Role change failed");
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-4"
        >
            {/* Header with search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-violet-400" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">User Management</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        {total}
                    </span>
                </div>
                <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 backdrop-blur-md transition-all uppercase tracking-widest"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[9px] text-gray-500 uppercase tracking-widest bg-white/[0.03] border-b border-white/10">
                                <tr>
                                    <th className="px-5 py-4 font-black">User</th>
                                    <th className="px-5 py-4 font-black">Phone</th>
                                    <th className="px-5 py-4 font-black">Role</th>
                                    <th className="px-5 py-4 font-black">Coins</th>
                                    <th className="px-5 py-4 font-black">Subscription</th>
                                    <th className="px-5 py-4 font-black">Status</th>
                                    <th className="px-5 py-4 font-black">Joined</th>
                                    <th className="px-5 py-4 font-black text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <AnimatePresence>
                                    {filteredUsers.map((user) => (
                                        <motion.tr
                                            key={user._id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="hover:bg-white/[0.04] transition-colors group"
                                        >
                                            <td className="px-5 py-4">
                                                <div>
                                                    <p className="text-xs font-bold text-white tracking-wide">{user.name || "—"}</p>
                                                    <p className="text-[10px] text-gray-500 font-semibold">{user.email}</p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-xs font-mono text-gray-400 tracking-wider">{user.phone || "—"}</td>
                                            <td className="px-5 py-4">
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${user.role === "admin"
                                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                                    : "bg-white/5 text-gray-400 border border-white/10"}`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-xs font-black text-yellow-500 tracking-widest">{user.coins}</td>
                                            <td className="px-5 py-4">
                                                {user.subscription?.status === "active" ? (
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-primary">Active</span>
                                                        {user.subscription.expiresAt && (
                                                            <p className="text-[9px] text-gray-600 font-semibold mt-0.5">
                                                                Expires {format(new Date(user.subscription.expiresAt), "MMM dd")}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">None</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                {user.isBanned ? (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
                                                        Banned
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-[10px] text-gray-500 tracking-widest font-semibold">
                                                {format(new Date(user.createdAt), "MMM dd, yyyy")}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {actionLoading === user._id ? (
                                                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleBan(user._id, user.isBanned)}
                                                                title={user.isBanned ? "Unban" : "Ban"}
                                                                className={`p-2 rounded-lg transition-all ${user.isBanned
                                                                    ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                                                                    : "bg-red-500/10 hover:bg-red-500/20 text-red-400"}`}
                                                            >
                                                                <Ban className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleRole(user._id, user.role)}
                                                                title="Toggle Role"
                                                                className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all"
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleExtend(user._id)}
                                                                title="Extend 30 days"
                                                                className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all"
                                                            >
                                                                <Clock className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                            {search ? "No users match your search" : "No users found"}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-white/[0.02]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            Page {page} of {pages} · {total} users
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => fetchUsers(page - 1)}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                                onClick={() => fetchUsers(page + 1)}
                                disabled={page >= pages}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
