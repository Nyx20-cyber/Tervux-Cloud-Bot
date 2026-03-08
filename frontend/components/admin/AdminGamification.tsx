"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/store/useAuthStore";
import { toast } from "sonner";
import { Search, Crown, Loader2 } from "lucide-react";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GamificationUser {
    _id: string;
    email: string;
    name: string;
    badges: string[];
    isVIP: boolean;
    totalDeployments?: number;
    totalReferrals?: number;
    totalCoinsSpent?: number;
}

export function AdminGamification() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [users, setUsers] = useState<GamificationUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<{
        type: "badge" | "vip";
        userId: string;
        userName: string;
        userBadges: string[];
        userVIP: boolean;
        badgeToToggle?: "pioneer" | "social_butterfly" | "bot_master";
    } | null>(null);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const limit = 100;
            let page = 1;
            let pages = 1;
            const allUsers: GamificationUser[] = [];

            do {
                const res = await api.get(`/admin/users?page=${page}&limit=${limit}`);
                allUsers.push(...(res.data.users || []));
                pages = res.data.pages || 1;
                page += 1;
            } while (page <= pages);

            setUsers(allUsers);
        } catch (error) {
            console.error(error);
            toast.error(t.admin_failed_fetch_users);
        } finally {
            setIsLoading(false);
        }
    }, [t.admin_failed_fetch_users]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_user_updated", (payload: { user?: GamificationUser }) => {
            const updatedUser = payload?.user;
            if (!updatedUser?._id) return;

            setUsers(prev => {
                let found = false;
                const next = prev.map(u => {
                    if (u._id === updatedUser._id) {
                        found = true;
                        return { ...u, ...updatedUser };
                    }
                    return u;
                });
                return found ? next : [updatedUser, ...next];
            });
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = useMemo(() => {
        const vipCount = users.filter((u) => u.isVIP).length;
        const pioneerCount = users.filter((u) => (u.badges || []).includes("pioneer")).length;
        const butterflyCount = users.filter((u) => (u.badges || []).includes("social_butterfly")).length;
        const botMasterCount = users.filter((u) => (u.badges || []).includes("bot_master")).length;
        return { vipCount, pioneerCount, butterflyCount, botMasterCount };
    }, [users]);

    const toggleBadge = async (
        userId: string,
        currentBadges: string[],
        badgeToToggle: "pioneer" | "social_butterfly" | "bot_master",
        isVIP: boolean
    ) => {
        setUpdatingUserId(userId);
        try {
            let newBadges = [...(currentBadges || [])];

            if (newBadges.includes(badgeToToggle)) {
                newBadges = newBadges.filter(b => b !== badgeToToggle);
            } else {
                newBadges.push(badgeToToggle);
                if ((badgeToToggle === "social_butterfly" || badgeToToggle === "bot_master")) {
                    newBadges = newBadges.filter(b => b !== "pioneer");
                }
            }

            if (newBadges.length === 0) {
                newBadges.push("pioneer");
            }

            await api.post(`/admin/users/${userId}/gamification`, {
                badges: newBadges,
                isVIP
            });
            toast.success(t.admin_user_badges_updated_successfully);
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, badges: newBadges } : u));
        } catch (error) {
            toast.error(t.admin_failed_update_user_badges);
            console.error(error);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const toggleVIP = async (userId: string, currentBadges: string[], currentVIP: boolean) => {
        setUpdatingUserId(userId);
        try {
            await api.post(`/admin/users/${userId}/gamification`, {
                badges: currentBadges,
                isVIP: !currentVIP
            });
            toast.success(`${t.admin_user_vip_status} ${!currentVIP ? t.admin_granted : t.admin_revoked}`);
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, isVIP: !currentVIP } : u));
        } catch (error) {
            toast.error(t.admin_failed_update_vip_status);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const runPendingAction = async () => {
        if (!pendingAction) return;

        if (pendingAction.type === "badge" && pendingAction.badgeToToggle) {
            await toggleBadge(
                pendingAction.userId,
                pendingAction.userBadges || [],
                pendingAction.badgeToToggle,
                !!pendingAction.userVIP
            );
        }

        if (pendingAction.type === "vip") {
            await toggleVIP(
                pendingAction.userId,
                pendingAction.userBadges || [],
                !!pendingAction.userVIP
            );
        }

        setPendingAction(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                        <Crown className="w-5 h-5 text-yellow-500" />
                        {t.admin_badges_vip_management}
                    </h2>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">{t.admin_control_user_achievements}</p>
                </div>

                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder={t.admin_search_email_or_name}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs uppercase tracking-widest text-white focus:outline-none focus:border-primary/50"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Users</p>
                    <p className="mt-2 text-xl font-black text-white">{users.length}</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{t.vip_rank}</p>
                    <p className="mt-2 text-xl font-black text-zinc-200">{stats.vipCount}</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Badges</p>
                    <p className="mt-2 text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                        🌱 {stats.pioneerCount} · 🦋 {stats.butterflyCount} · 🤖 {stats.botMasterCount}
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredUsers.map((user) => {
                    const hasPioneer = user.badges?.includes("pioneer");
                    const hasButterfly = user.badges?.includes("social_butterfly");
                    const hasBotMaster = user.badges?.includes("bot_master");
                    const isUpdating = updatingUserId === user._id;

                    return (
                        <motion.div
                            key={user._id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white/5 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden"
                        >
                            {isUpdating && (
                                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-10 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                </div>
                            )}

                            <div>
                                <h3 className="text-sm font-bold text-white uppercase tracking-widest truncate">{user.name}</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest truncate">{user.email}</p>
                                <p className="mt-2 text-[9px] text-gray-500 uppercase tracking-wider">
                                    Deployments: {user.totalDeployments || 0} · Referrals: {user.totalReferrals || 0} · Coins spent: {user.totalCoinsSpent || 0}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                <button
                                    onClick={() => setPendingAction({
                                        type: "badge",
                                        userId: user._id,
                                        userName: user.name || user.email || "User",
                                        userBadges: user.badges || [],
                                        userVIP: !!user.isVIP,
                                        badgeToToggle: "pioneer"
                                    })}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasPioneer
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-emerald-500/30 hover:text-emerald-400"
                                        }`}
                                >
                                    🌱 {t.pioneer_badge}
                                </button>
                                <button
                                    onClick={() => setPendingAction({
                                        type: "badge",
                                        userId: user._id,
                                        userName: user.name || user.email || "User",
                                        userBadges: user.badges || [],
                                        userVIP: !!user.isVIP,
                                        badgeToToggle: "social_butterfly"
                                    })}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasButterfly
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-blue-500/30 hover:text-blue-400"
                                        }`}
                                >
                                    🦋 {t.social_butterfly_badge}
                                </button>
                                <button
                                    onClick={() => setPendingAction({
                                        type: "badge",
                                        userId: user._id,
                                        userName: user.name || user.email || "User",
                                        userBadges: user.badges || [],
                                        userVIP: !!user.isVIP,
                                        badgeToToggle: "bot_master"
                                    })}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasBotMaster
                                            ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-purple-500/30 hover:text-purple-400"
                                        }`}
                                >
                                    🤖 {t.bot_master_badge}
                                </button>
                                <button
                                    onClick={() => setPendingAction({
                                        type: "vip",
                                        userId: user._id,
                                        userName: user.name || user.email || "User",
                                        userBadges: user.badges || [],
                                        userVIP: !!user.isVIP
                                    })}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${user.isVIP
                                            ? "bg-zinc-800/80 border-zinc-500/50 text-zinc-300"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-zinc-500/50 hover:text-zinc-300"
                                        }`}
                                >
                                    💎 {t.vip_rank}
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 text-[10px] uppercase tracking-widest font-bold">
                        {t.admin_no_users_found}
                    </div>
                )}
                </div>
            )}

            <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {pendingAction?.type === "vip" ? t.admin_confirm_vip_change_title : t.admin_confirm_badge_change_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {pendingAction?.type === "vip"
                                ? `${t.admin_confirm_vip_change_desc} ${pendingAction?.userName}?`
                                : `${t.admin_confirm_badge_change_desc} ${pendingAction?.userName}?`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPendingAction(null)}>
                            {t.cancel}
                        </Button>
                        <Button
                            onClick={runPendingAction}
                            disabled={!!updatingUserId}
                            className="bg-primary text-black hover:bg-primary/90"
                        >
                            {t.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
