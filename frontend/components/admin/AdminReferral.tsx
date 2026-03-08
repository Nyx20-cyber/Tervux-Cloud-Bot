"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import { toast } from "sonner";
import {
    Crown, Users, Trophy, RotateCcw, Loader2, Zap, Trash2,
    RefreshCw, Settings, TrendingUp, Star
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

interface ReferralOverview {
    leaderboard: {
        _id: string;
        count: number;
        name: string;
        email: string;
        isReferralKing: boolean;
        weeklyReferralCount: number;
    }[];
    currentKing: { _id: string; name: string; email: string; referralKingSince: string; coins: number } | null;
    totalReferrals: number;
    topWeekly: { name: string; email: string; weeklyReferralCount: number } | null;
    kingBonusCoins: number;
    referralBonus: number;
}

export function AdminReferral() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const [data, setData] = useState<ReferralOverview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTriggeringCeremony, setIsTriggeringCeremony] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isDethroning, setIsDethroning] = useState(false);
    const [bonusCoinsInput, setBonusCoinsInput] = useState("");
    const [refBonusInput, setRefBonusInput] = useState("");

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/referral/overview");
            setData(res.data);
            setBonusCoinsInput(String(res.data.kingBonusCoins));
            setRefBonusInput(String(res.data.referralBonus));
        } catch {
            toast.error(t.admin_failed_load_referral_data);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSaveBonus = async () => {
        const val = Number(bonusCoinsInput);
        const refVal = Number(refBonusInput);
        if (isNaN(val) || val <= 0) return toast.error(t.admin_enter_valid_king_bonus_amount);
        if (isNaN(refVal) || refVal <= 0) return toast.error(t.admin_enter_valid_referral_bonus_amount);

        setIsSaving(true);
        try {
            await api.put("/admin/settings", {
                kingBonusCoins: val,
                referralBonus: refVal
            });
            setData(prev => prev ? { ...prev, kingBonusCoins: val } : prev);
            toast.success(t.admin_reward_coins_updated_notified);
        } catch {
            toast.error(t.admin_failed_update_bonus_coins);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTriggerCeremony = async () => {
        if (!confirm(t.admin_confirm_trigger_ceremony)) return;
        setIsTriggeringCeremony(true);
        try {
            const res = await api.post("/admin/referral/trigger-ceremony");
            toast.success(res.data.message);
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_ceremony_failed);
        } finally {
            setIsTriggeringCeremony(false);
        }
    };

    const handleResetWeekly = async () => {
        if (!confirm(t.admin_confirm_reset_weekly_counts)) return;
        setIsResetting(true);
        try {
            await api.post("/admin/referral/reset-weekly");
            toast.success(t.admin_weekly_counts_reset);
            fetchData();
        } catch {
            toast.error(t.admin_failed_reset_counts);
        } finally {
            setIsResetting(false);
        }
    };

    const handleDethrone = async () => {
        if (!confirm(t.admin_confirm_dethrone_king)) return;
        setIsDethroning(true);
        try {
            await api.delete("/admin/referral/dethrone");
            toast.success(t.admin_king_dethroned);
            fetchData();
        } catch {
            toast.error(t.admin_failed_dethrone_king);
        } finally {
            setIsDethroning(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                    <Crown className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">{t.admin_referral_management}</h2>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.admin_king_ceremony_leaderboard_settings}</p>
                </div>
                <button onClick={fetchData} className="ml-auto p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
                    <RefreshCw className="h-4 w-4" />
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: t.total_referrals, value: data?.totalReferrals ?? 0, icon: Users, color: "primary" },
                    { label: t.admin_king_bonus_coins, value: `${data?.kingBonusCoins} 🪙`, icon: Crown, color: "yellow-400" },
                    { label: t.admin_referral_bonus, value: `${data?.referralBonus || 10} 🪙`, icon: Star, color: "primary" },
                    { label: t.admin_current_king, value: data?.currentKing ? `${data.currentKing.name.charAt(0)}***` : t.admin_none, icon: Trophy, color: "yellow-500" },
                    { label: t.admin_this_weeks_leader, value: data?.topWeekly ? `${data.topWeekly.weeklyReferralCount} ${t.referrals}` : t.admin_no_one_yet, icon: TrendingUp, color: "primary" },
                ].map((stat, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                        className="p-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-3">
                        <div className="flex items-center gap-2">
                            <stat.icon className={`h-4 w-4 text-${stat.color}`} />
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-2xl font-black text-white">{stat.value}</p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Settings + Actions */}
                <div className="space-y-5">
                    {/* Reward Coins Settings */}
                    <Card className="bg-white/5 border-yellow-500/20 border">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Settings className="h-4 w-4 text-yellow-400" /> {t.admin_reward_coins_settings}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{t.admin_weekly_king_bonus}</label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={bonusCoinsInput}
                                    onChange={e => setBonusCoinsInput(e.target.value)}
                                    className="bg-black/40 border-yellow-500/20 text-yellow-400 font-black text-lg h-12 rounded-xl focus-visible:ring-yellow-500/30"
                                    placeholder={t.admin_example_100}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{t.admin_referral_bonus_per_purchase}</label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={refBonusInput}
                                    onChange={e => setRefBonusInput(e.target.value)}
                                    className="bg-black/40 border-white/10 text-primary font-black text-lg h-12 rounded-xl focus-visible:ring-primary/30"
                                    placeholder={t.admin_example_10}
                                />
                            </div>

                            <Button
                                onClick={handleSaveBonus}
                                disabled={isSaving}
                                className="w-full h-12 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl px-5 text-[10px] uppercase tracking-widest"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t.admin_update_rewards_notify_users}
                            </Button>

                            <p className="text-[9px] text-yellow-500/50 font-bold uppercase tracking-widest text-center">
                                {t.admin_changing_rewards_broadcast_notice}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Admin Actions */}
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Zap className="h-4 w-4 text-primary" /> {t.admin_actions}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button
                                onClick={handleTriggerCeremony}
                                disabled={isTriggeringCeremony}
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-black text-[10px] uppercase tracking-widest rounded-xl"
                            >
                                {isTriggeringCeremony ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
                                {t.admin_trigger_king_ceremony_now}
                            </Button>
                            <Button
                                onClick={handleResetWeekly}
                                disabled={isResetting}
                                variant="outline"
                                className="w-full h-11 border-white/10 bg-white/5 text-white hover:bg-white/10 font-black text-[10px] uppercase tracking-widest rounded-xl"
                            >
                                {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                                {t.admin_reset_weekly_counts}
                            </Button>
                            <Button
                                onClick={handleDethrone}
                                disabled={isDethroning || !data?.currentKing}
                                variant="destructive"
                                className="w-full h-11 font-black text-[10px] uppercase tracking-widest rounded-xl disabled:opacity-40"
                                title={!data?.currentKing ? t.admin_no_king_currently_crowned : t.admin_remove_current_king_crown}
                            >
                                {isDethroning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                {t.admin_dethrone_current_king}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Current King Detail */}
                    {data?.currentKing && (
                        <Card className="bg-gradient-to-br from-yellow-950/60 to-amber-900/20 border-yellow-500/30">
                            <CardContent className="pt-6 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-yellow-500/20">
                                        <Crown className="h-5 w-5 text-yellow-400" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-yellow-500/60 uppercase tracking-widest">{t.admin_current_king}</p>
                                        <p className="text-sm font-black text-white">{data.currentKing.name} 👑</p>
                                    </div>
                                </div>
                                <div className="space-y-1 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                                    <p>{t.email_address}: <span className="text-gray-300">{data.currentKing.email}</span></p>
                                    <p>{t.coins_word}: <span className="text-yellow-400">{data.currentKing.coins} 🪙</span></p>
                                    <p>{t.admin_crowned}: <span className="text-gray-300">{new Date(data.currentKing.referralKingSince).toLocaleDateString()}</span></p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right: Leaderboard */}
                <div className="lg:col-span-2">
                    <Card className="bg-white/5 border-white/10 h-full">
                        <CardHeader className="pb-4 border-b border-white/5 bg-yellow-500/5">
                            <CardTitle className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-yellow-500" /> {t.admin_all_time_top_referrers}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {!data?.leaderboard.length ? (
                                <div className="p-16 text-center">
                                    <Star className="h-8 w-8 mx-auto opacity-10 mb-3" />
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t.admin_no_referrals_recorded_yet}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {data.leaderboard.map((item, i) => (
                                        <div key={item._id} className={cn(
                                            "flex items-center gap-4 px-6 py-4 transition-colors",
                                            item.isReferralKing ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "hover:bg-white/[0.02]"
                                        )}>
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0",
                                                i === 0 ? "bg-yellow-500 text-black" :
                                                    i === 1 ? "bg-gray-300 text-black" :
                                                        i === 2 ? "bg-orange-400 text-black" :
                                                            "bg-white/5 text-gray-500"
                                            )}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                    {item.name}
                                                    {item.isReferralKing && <span className="text-yellow-400">👑</span>}
                                                </p>
                                                <p className="text-[9px] font-bold text-gray-500 truncate">{item.email}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-black text-white">{item.count}</p>
                                                <p className="text-[9px] font-bold text-gray-600 uppercase">{t.admin_all_time}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={cn("text-sm font-black", item.weeklyReferralCount > 0 ? "text-primary" : "text-gray-700")}>{item.weeklyReferralCount}</p>
                                                <p className="text-[9px] font-bold text-gray-600 uppercase">{t.admin_this_week}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
