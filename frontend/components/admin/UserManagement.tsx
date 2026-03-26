"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import { Search, Ban, ShieldCheck, ChevronLeft, ChevronRight, Loader2, UserCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UserRecord {
    _id: string;
    email: string;
    name: string;
    phone: string;
    role: "user" | "admin";
    coins: number;
    isBanned: boolean;
    createdAt: string;
}

export function UserManagement() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<{
        type: "ban" | "role" | "delete";
        userId: string;
        userName: string;
        userRole?: "user" | "admin";
        currentRole?: "user" | "admin";
        isBanned?: boolean;
    } | null>(null);

    const fetchUsers = useCallback(async (p: number, query: string = "") => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: "10"
            });

            if (query) {
                params.set("search", query);
            }

            const res = await api.get(`/admin/users?${params.toString()}`);
            setUsers(res.data.users);
            setTotal(res.data.total);
            setPages(res.data.pages);
            setPage(res.data.page);
        } catch (err) {
            console.error(err);
            toast.error(t.admin_failed_fetch_users);
        } finally {
            setIsLoading(false);
        }
    }, [t.admin_failed_fetch_users]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const nextQuery = search.trim();
            setSearchQuery(nextQuery);
            setPage(1);
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [search]);

    useEffect(() => {
        fetchUsers(page, searchQuery);
    }, [fetchUsers, page, searchQuery]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_user_updated", (payload: { user?: UserRecord }) => {
            const updatedUser = payload?.user;
            if (!updatedUser?._id) return;

            setUsers(prev => {
                const found = prev.some(user => user._id === updatedUser._id);
                if (!found) {
                    void fetchUsers(page, searchQuery);
                    return prev;
                }

                return prev.map(user => (user._id === updatedUser._id ? { ...user, ...updatedUser } : user));
            });
        });

        socket.on("admin_user_deleted", (payload: { userId?: string }) => {
            const deletedUserId = payload?.userId;
            if (!deletedUserId) return;

            void fetchUsers(page, searchQuery);
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchUsers, page, searchQuery, token]);

    const handleBan = async (userId: string, isBanned: boolean) => {
        setActionLoading(userId);
        try {
            await api.put(`/admin/users/${userId}`, { isBanned: !isBanned });
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, isBanned: !isBanned } : u));
            toast.success(isBanned ? t.admin_user_unbanned : t.admin_user_banned);
        } catch (err) {
            toast.error(t.admin_action_failed);
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
            toast.success(`${t.admin_role_changed_to} ${newRole}`);
        } catch (err) {
            toast.error(t.admin_role_change_failed);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        setActionLoading(userId);
        try {
            await api.delete(`/admin/users/${userId}`);
            toast.success(t.admin_user_deleted);

            const targetPage = users.length === 1 && page > 1 ? page - 1 : page;
            await fetchUsers(targetPage, searchQuery);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || t.admin_failed_delete_user);
        } finally {
            setActionLoading(null);
        }
    };

    const runPendingAction = async () => {
        if (!pendingAction) return;
        if (pendingAction.type === "ban") {
            await handleBan(pendingAction.userId, !!pendingAction.isBanned);
        } else if (pendingAction.type === "role") {
            await handleToggleRole(pendingAction.userId, pendingAction.currentRole || "user");
        } else if (pendingAction.type === "delete") {
            await handleDeleteUser(pendingAction.userId);
        }
        setPendingAction(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3 sm:space-y-4"
        >
            {/* Header with search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-violet-400" />
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">{t.admin_user_management}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        {total}
                    </span>
                </div>
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder={t.admin_search_users}
                        value={search}
                        onChange={(e) => setSearch(e.target.value.toLowerCase())}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold lowercase text-white placeholder:text-gray-500 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 backdrop-blur-md transition-all"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-sm text-left">
                            <thead className="text-[9px] text-gray-500 uppercase tracking-widest bg-white/[0.03] border-b border-white/10">
                                <tr>
                                    <th className="px-5 py-4 font-black">{t.users}</th>
                                    <th className="px-5 py-4 font-black">{t.phone_number}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_role}</th>
                                    <th className="px-5 py-4 font-black">{t.coins_word}</th>
                                    <th className="px-5 py-4 font-black">{t.status_label}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_joined}</th>
                                    <th className="px-5 py-4 font-black text-right">{t.admin_actions}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <AnimatePresence>
                                    {users.map((user) => (
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
                                                {user.isBanned ? (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
                                                        {t.admin_banned}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        {t.admin_active}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-[10px] text-gray-500 tracking-widest font-semibold">
                                                {format(new Date(user.createdAt), "MMM dd, yyyy")}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-end gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    {actionLoading === user._id ? (
                                                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => setPendingAction({
                                                                    type: "ban",
                                                                    userId: user._id,
                                                                    userName: user.name || user.email || "User",
                                                                    isBanned: user.isBanned
                                                                })}
                                                                title={user.isBanned ? t.admin_unban : t.admin_ban}
                                                                className={`p-2 rounded-lg transition-all ${user.isBanned
                                                                    ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                                                                    : "bg-red-500/10 hover:bg-red-500/20 text-red-400"}`}
                                                            >
                                                                <Ban className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setPendingAction({
                                                                    type: "role",
                                                                    userId: user._id,
                                                                    userName: user.name || user.email || "User",
                                                                    currentRole: user.role
                                                                })}
                                                                title={t.admin_toggle_role}
                                                                className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all"
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setPendingAction({
                                                                    type: "delete",
                                                                    userId: user._id,
                                                                    userName: user.name || user.email || "User",
                                                                    userRole: user.role
                                                                })}
                                                                title={t.admin_delete_user_title}
                                                                className="p-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-all"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                            {search ? t.admin_no_users_match_search : t.admin_no_users_found}
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
                            {t.admin_page} {page} {t.admin_of} {pages} · {total} {t.users}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(page - 1)}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                                onClick={() => setPage(page + 1)}
                                disabled={page >= pages}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
                <DialogContent className={`max-w-md text-white rounded-2xl ${
                    pendingAction?.type === "delete"
                        ? "border-red-500/20 bg-[#12090a]"
                        : pendingAction?.type === "ban" && !pendingAction?.isBanned
                            ? "border-orange-500/20 bg-[#120f09]"
                            : pendingAction?.type === "ban" && pendingAction?.isBanned
                                ? "border-emerald-500/20 bg-[#09120d]"
                                : "border-sky-500/20 bg-[#0b1016]"
                }`}>
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {pendingAction?.type === "ban"
                                ? (pendingAction?.isBanned ? t.admin_confirm_unban_title : t.admin_confirm_ban_title)
                                : pendingAction?.type === "role"
                                    ? t.admin_confirm_role_title
                                    : t.admin_delete_user_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {pendingAction?.type === "ban"
                                ? (pendingAction?.isBanned
                                    ? `${t.admin_confirm_unban_desc} ${pendingAction.userName}?`
                                    : `${t.admin_confirm_ban_desc} ${pendingAction.userName}?`)
                                : pendingAction?.type === "role"
                                    ? `${t.admin_confirm_role_desc} ${pendingAction?.userName}?`
                                    : `${t.admin_confirm_delete_user_desc} ${pendingAction?.userName}? ${t.admin_confirm_delete_user_warning}${pendingAction?.userRole === "admin" ? ` ${t.admin_confirm_delete_admin_warning}` : ""}`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!actionLoading}
                            onClick={() => setPendingAction(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!actionLoading || !pendingAction}
                            onClick={runPendingAction}
                            className={pendingAction?.type === "delete"
                                ? "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                                : pendingAction?.type === "ban" && !pendingAction?.isBanned
                                    ? "bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 hover:text-white"
                                    : pendingAction?.type === "ban" && pendingAction?.isBanned
                                        ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                        : "bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30 hover:text-white"}
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (pendingAction?.type === "delete" ? t.delete : t.confirm)}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
