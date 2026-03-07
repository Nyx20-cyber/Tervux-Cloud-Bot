"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, CheckCircle2, Flame, Loader2, Sparkles } from "lucide-react";
import { useAuthStore, api } from "@/store/useAuthStore";
import { translations } from "@/lib/translations";
import { useLocaleStore } from "@/store/useLocaleStore";
import { toast } from "sonner";

export function DailyCheckIn() {
    const { user, setUser } = useAuthStore();
    const { language } = useLocaleStore();
    const t = translations[language];

    const [isLoading, setIsLoading] = useState(false);

    if (!user) return null;

    // Check if claimed today based on local time
    const today = new Date().setHours(0, 0, 0, 0);
    const lastClaim = user.lastDailyClaim ? new Date(user.lastDailyClaim).setHours(0, 0, 0, 0) : 0;
    const canClaim = lastClaim !== today;

    const handleClaim = async () => {
        if (!canClaim) return;
        setIsLoading(true);
        try {
            const res = await api.post("/auth/daily-claim");
            setUser(res.data.user);

            toast.success(`✨ You claimed ${res.data.rewardCoins} coins! ${t.come_back_tomorrow}`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to claim reward");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative mb-8 rounded-3xl border overflow-hidden transition-all duration-700 border-yellow-500/30 bg-gradient-to-r from-yellow-950/40 via-yellow-900/10 to-yellow-950/40 backdrop-blur-xl`}
        >
            {/* Background effects */}
            <div className="absolute top-0 right-0 p-8 opacity-20 blur-3xl pointer-events-none">
                <div className={`w-32 h-32 rounded-full bg-yellow-500`} />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 p-5 sm:p-6">

                {/* Left info side */}
                <div className="flex-1 space-y-2 text-center md:text-left">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-widest bg-yellow-500/10 border-yellow-500/20 text-yellow-500`}>
                        <Flame className={`w-4 h-4 text-orange-500`} />
                        {t.daily_reward}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {t.punch_card_to_win}
                    </h2>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                        {canClaim
                            ? "Claim your free random coins today! (1-5 🪙)"
                            : `${t.already_claimed_today} • ${t.come_back_tomorrow}`}
                    </p>
                </div>

                {/* Right button side */}
                <div className="shrink-0 flex flex-col items-center gap-4">
                    <button
                        onClick={handleClaim}
                        disabled={!canClaim || isLoading}
                        className={`group relative flex items-center justify-center min-w-[200px] gap-2 px-8 py-4 rounded-2xl font-semibold text-sm uppercase tracking-widest transition-all ${canClaim
                            ? "bg-yellow-500 hover:bg-yellow-400 text-black shadow-[0_0_30px_rgba(234,179,8,0.2)] hover:shadow-[0_0_40px_rgba(234,179,8,0.4)] hover:-translate-y-1"
                            : "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : canClaim ? (
                            <Gift className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        )}
                        {isLoading ? "..." : canClaim ? t.claim_reward : t.already_claimed_today}

                        {/* Shimmer effect when active */}
                        {canClaim && (
                            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                                <div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-[100%] animate-[shimmer_2s_infinite]" />
                            </div>
                        )}
                    </button>
                </div>

            </div>
        </motion.div>
    );

}
