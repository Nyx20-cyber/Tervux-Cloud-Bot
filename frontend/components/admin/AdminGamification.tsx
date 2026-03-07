"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/store/useAuthStore";
import { toast } from "sonner";
import { Search, Crown, Loader2 } from "lucide-react";

export function AdminGamification({ users, onUpdate }: { users: any[], onUpdate: () => void }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

    const filteredUsers = (users || []).filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleBadge = async (userId: string, currentBadges: string[], badgeToToggle: string, isVIP: boolean) => {
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
            toast.success("User badges updated successfully");
            onUpdate();
        } catch (error) {
            toast.error("Failed to update user badges");
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
            toast.success(`User VIP status ${!currentVIP ? 'granted' : 'revoked'}`);
            onUpdate();
        } catch (error) {
            toast.error("Failed to update VIP status");
        } finally {
            setUpdatingUserId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                        <Crown className="w-5 h-5 text-yellow-500" />
                        Badges & VIP Management
                    </h2>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Control user achievements and pro tiers</p>
                </div>

                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="SEARCH EMAIL OR NAME..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs uppercase tracking-widest text-white focus:outline-none focus:border-primary/50"
                    />
                </div>
            </div>

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
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                <button
                                    onClick={() => toggleBadge(user._id, user.badges, "pioneer", user.isVIP)}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasPioneer
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-emerald-500/30 hover:text-emerald-400"
                                        }`}
                                >
                                    🌱 Pioneer
                                </button>
                                <button
                                    onClick={() => toggleBadge(user._id, user.badges, "social_butterfly", user.isVIP)}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasButterfly
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-blue-500/30 hover:text-blue-400"
                                        }`}
                                >
                                    🦋 Butterfly
                                </button>
                                <button
                                    onClick={() => toggleBadge(user._id, user.badges, "bot_master", user.isVIP)}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${hasBotMaster
                                            ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-purple-500/30 hover:text-purple-400"
                                        }`}
                                >
                                    🤖 Bot Master
                                </button>
                                <button
                                    onClick={() => toggleVIP(user._id, user.badges, user.isVIP)}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${user.isVIP
                                            ? "bg-zinc-800/80 border-zinc-500/50 text-zinc-300"
                                            : "bg-white/5 border-white/10 text-gray-500 hover:border-zinc-500/50 hover:text-zinc-300"
                                        }`}
                                >
                                    💎 VIP Status
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 text-[10px] uppercase tracking-widest font-bold">
                        No users found
                    </div>
                )}
            </div>
        </div>
    );
}
