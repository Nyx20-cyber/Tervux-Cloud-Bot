"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

import { useAuthStore } from "@/store/useAuthStore";
import { LogOut, User, Menu, Coins, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./NotificationBell";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
    const { user, logout } = useAuthStore();
    const { language, setLanguage } = useLocaleStore();
    const t = translations[language];
    const isKing = !!(user as any)?.isReferralKing;

    // Track coins to trigger confetti
    const prevCoins = useRef(user?.coins || 0);

    useEffect(() => {
        if (user?.coins !== undefined) {
            if (user.coins > prevCoins.current) {
                // Fire confetti on coin increase
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#eab308', '#ca8a04', '#fef08a'] // Yellow/Gold theme
                });
            }
            prevCoins.current = user.coins;
        }
    }, [user?.coins]);

    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 z-20 relative">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="lg:hidden text-white" onClick={onMenuClick}>
                    <Menu className="h-5 w-5" />
                </Button>
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 backdrop-blur-md">
                    <div className="relative flex h-1.5 w-1.5">
                        <motion.span
                            animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"
                        ></motion.span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                    </div>
                    <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-primary">Service Online</span>
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
                <div className="hidden lg:flex items-center gap-2 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20 mr-2">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    <span className="text-[10px] font-bold tracking-widest text-yellow-500 uppercase">{user?.coins || 0} Coins</span>
                </div>

                {/* Language Toggle */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-9 px-3 text-white bg-white/5 border border-white/5 rounded-xl transition-all hover:bg-white/5">
                            <span className="mr-2 text-base">{language === "en" ? "🇺🇸" : "🇹🇿"}</span>
                            <span className="text-[10px] font-bold tracking-widest">{language.toUpperCase()}</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-white min-w-[140px] p-2 rounded-2xl shadow-2xl backdrop-blur-xl">
                        <DropdownMenuLabel className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 pb-2 border-b border-white/5 mb-1">
                            {t.language}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => setLanguage("en")}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors uppercase text-[10px] font-bold tracking-widest mb-1",
                                language === "en" ? "bg-primary text-black" : "hover:bg-white/5 text-gray-400"
                            )}
                        >
                            🇺🇸 {t.english}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setLanguage("sw")}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors uppercase text-[10px] font-bold tracking-widest",
                                language === "sw" ? "bg-primary text-black" : "hover:bg-white/5 text-gray-400"
                            )}
                        >
                            🇹🇿 {t.swahili}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <NotificationBell />

                {/* Gamification Badges */}
                <div className="hidden sm:flex items-center gap-1.5">
                    {user?.badges?.map((badgeStr) => {
                        let badgeIcon = "🌱";
                        let badgeLabel = t.pioneer_badge;
                        let badgeColor = "text-emerald-400";
                        let bgColor = "bg-emerald-500/10 border-emerald-500/30";

                        if (badgeStr === "social_butterfly") {
                            badgeIcon = "🦋";
                            badgeLabel = t.social_butterfly_badge;
                            badgeColor = "text-blue-400";
                            bgColor = "bg-blue-500/10 border-blue-500/30";
                        } else if (badgeStr === "bot_master") {
                            badgeIcon = "🤖";
                            badgeLabel = t.bot_master_badge;
                            badgeColor = "text-purple-400";
                            bgColor = "bg-purple-500/10 border-purple-500/30";
                        }

                        return (
                            <motion.div
                                key={badgeStr}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${bgColor} cursor-default`}
                                title={badgeLabel}
                            >
                                <span className="text-base">{badgeIcon}</span>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${badgeColor}`}>
                                    {badgeLabel}
                                </span>
                            </motion.div>
                        );
                    })}

                    {user?.isVIP && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-zinc-800/50 border-zinc-500/30 cursor-default"
                            title={t.vip_rank}
                        >
                            <span className="text-base">💎</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">
                                VIP
                            </span>
                        </motion.div>
                    )}
                </div>

                {/* King Badge — shown only if the current user is the Referral King */}
                {isKing && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="hidden sm:flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 px-3 py-1.5 rounded-full"
                        title={language === "sw" ? "Wewe ni Mfalme wa Wiki hii 👑" : "You are this week's Referral King 👑"}
                    >
                        <motion.span
                            animate={{ rotate: [-5, 5, -5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="text-base"
                        >
                            👑
                        </motion.span>
                        <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest">
                            {language === "sw" ? "Mfalme" : "King"}
                        </span>
                    </motion.div>
                )}


                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => logout()}
                    className="flex items-center h-8 px-4 rounded-full border border-red-500/20 bg-red-500/10 text-red-500 transition-all cursor-pointer"
                >
                    <LogOut className="h-3 w-3 mr-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Logout</span>
                </motion.button>
            </div>
        </header>
    );
}
