"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Users, Gift, Copy, RotateCcw, Loader2, Info, Coins, Star, Trophy, Medal, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { cn } from "@/lib/utils";

interface LeaderboardItem {
    _id: string;
    count: number;
    name: string;
    isReferralKing?: boolean;
    referralKingSince?: string;
}

interface KingInfo {
    _id: string;
    name: string;
    referralKingSince: string;
}

export default function ReferralsPage() {
    const { language } = useLocaleStore();
    const t = translations[language];

    const [referralInfo, setReferralInfo] = useState<{
        referralCode: string | null;
        referralCodeExpiresAt: string | null;
        referralCount: number;
        kingBonusCoins: number;
    }>({
        referralCode: null,
        referralCodeExpiresAt: null,
        referralCount: 0,
        kingBonusCoins: 100
    });
    const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
    const [king, setKing] = useState<KingInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [refRes, leaderRes, kingRes] = await Promise.all([
                api.get("/referral"),
                api.get("/referral/leaderboard"),
                api.get("/referral/king")
            ]);
            setReferralInfo(refRes.data);
            setLeaderboard(leaderRes.data.leaderboard);
            setKing(kingRes.data.king);
        } catch (error) {
            toast.error(language === "sw" ? "Imeshindwa kupakia taarifa" : "Failed to load information");
        } finally {
            setIsLoading(false);
        }
    }, [language]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await api.post("/referral/generate");
            setReferralInfo(prev => ({
                ...prev,
                referralCode: res.data.referralCode,
                referralCodeExpiresAt: res.data.referralCodeExpiresAt
            }));
            toast.success(language === "sw" ? "Kodi mpya imetengenezwa!" : "New referral code generated!");
        } catch (error) {
            toast.error(language === "sw" ? "Imeshindwa kutengeneza kodi" : "Failed to generate referral code");
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(language === "sw" ? "Kodi imenakiliwa!" : "Code copied!");
    };

    const isExpired = false; // Codes are now permanent

    if (isLoading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                        <Users className="h-8 w-8 text-primary" />
                        {t.referrals}
                    </h1>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                        {language === "sw" ? "Alika marafiki na upate sarafu rafiki yako atakapofanya ununuzi" : "Invite friends and earn coins when they make their first purchase"}
                    </p>
                </div>

                {/* Weekly King Banner */}
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                            "relative overflow-hidden rounded-3xl border p-6",
                            king
                                ? "bg-gradient-to-r from-yellow-950/60 via-amber-900/30 to-yellow-950/60 border-yellow-500/40"
                                : "bg-white/5 border-white/10"
                        )}
                    >
                        {/* Background crown watermark */}
                        {king && (
                            <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
                                <Crown className="h-40 w-40 text-yellow-400" />
                            </div>
                        )}
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
                            <div className={cn(
                                "p-4 rounded-2xl flex-shrink-0",
                                king ? "bg-yellow-500/20" : "bg-white/5"
                            )}>
                                <Crown className={cn("h-7 w-7", king ? "text-yellow-400" : "text-gray-600")} />
                            </div>
                            <div className="flex-1">
                                <p className={cn(
                                    "text-[10px] font-black uppercase tracking-[0.2em] mb-1",
                                    king ? "text-yellow-500/70" : "text-gray-600"
                                )}>
                                    {t.weekly_king}
                                </p>
                                {king ? (
                                    <>
                                        <h2 className="text-xl font-black text-white tracking-tight">
                                            {king.name.charAt(0)}***{king.name.charAt(king.name.length - 1)}
                                            <span className="ml-2 text-yellow-400">👑</span>
                                        </h2>
                                        <p className="text-[10px] font-bold text-yellow-500/50 uppercase tracking-widest mt-0.5">
                                            {t.king_crowned} · {language === "sw" ? `Bonasi ya ${referralInfo.kingBonusCoins} Sarafu` : `Wins ${referralInfo.kingBonusCoins} Coins`} + Crown
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                                            {t.king_no_winner}
                                        </h2>
                                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-0.5">
                                            {t.king_compete}
                                        </p>
                                    </>
                                )}
                            </div>
                            {king && (
                                <div className="text-right flex-shrink-0">
                                    <p className="text-3xl font-black text-yellow-400">+{referralInfo.kingBonusCoins}</p>
                                    <p className="text-[9px] font-black text-yellow-500/50 uppercase tracking-widest">COINS 🪙</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Stats & Code Section */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Stats Card: Referrals */}
                            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col justify-between group relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Star className="h-24 w-24 text-primary" />
                                </div>
                                <div className="space-y-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 rounded-xl bg-primary/20 text-primary">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{language === "sw" ? "Athari ya Mtandao" : "Network Impact"}</p>
                                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">{language === "sw" ? "Mialiko Inayofanya Kazi" : "Active Referrals"}</h3>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 pt-2">
                                        <span className="text-4xl font-black text-white">{referralInfo.referralCount}</span>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{language === "sw" ? "Mialiko iliyofanikiwa" : "Successful invites"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Card: Earnings */}
                            <div className="p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md flex flex-col justify-between group relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Coins className="h-24 w-24 text-yellow-500" />
                                </div>
                                <div className="space-y-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 rounded-xl bg-yellow-500/20 text-yellow-500">
                                            <Coins className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-yellow-500/50 uppercase tracking-widest">{t.coins_earned} 🪙</p>
                                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">{language === "sw" ? "Sarafu 🪙 Zawadi" : "Coins 🪙 Rewarded"}</h3>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 pt-2">
                                        <span className="text-4xl font-black text-yellow-500">{referralInfo.referralCount * 10}</span>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{language === "sw" ? "🪙 Zawadi ya maisha yote" : "🪙 Lifetime reward"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Referral Code Card */}
                        <Card className="bg-white/5 border-white/10 backdrop-blur-xl border-t-primary/30">
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-bold text-white uppercase tracking-widest">{language === "sw" ? "Kodi Inayofanya Kazi" : "Active Code"}</CardTitle>
                                    <Gift className="h-4 w-4 text-primary" />
                                </div>
                                <CardDescription className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{language === "sw" ? "Kodi yako ya kudumu ya mialiko" : "Your permanent referral code"}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {referralInfo.referralCode ? (
                                    <div className="space-y-4">
                                        <div className="flex flex-col md:flex-row items-center gap-4">
                                            <div className="flex-1 w-full p-4 bg-black/40 border border-white/10 rounded-2xl font-mono text-4xl font-black tracking-[0.3em] text-primary text-center shadow-inner">
                                                {referralInfo.referralCode}
                                            </div>
                                            <Button
                                                variant="outline"
                                                className="w-full md:w-auto h-16 px-8 rounded-2xl border-white/10 bg-white/5 hover:bg-primary hover:text-black transition-all group font-black uppercase tracking-widest text-[10px]"
                                                onClick={() => copyToClipboard(referralInfo.referralCode!)}
                                            >
                                                <Copy className="h-4 w-4 mr-2" />
                                                {t.copy_code}
                                            </Button>
                                        </div>
                                        <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-2xl border border-primary/20">
                                            <Info className="w-4 h-4 text-primary mt-0.5" />
                                            <div>
                                                <p className="text-[11px] font-extrabold text-white uppercase tracking-wider">{t.referral_rule_title}</p>
                                                <p className="text-[10px] font-medium text-gray-400 mt-1 leading-relaxed">
                                                    {t.referral_rule_desc}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="p-8 border border-white/10 border-dashed rounded-2xl bg-black/20 flex flex-col items-center text-center space-y-3">
                                            <div className="p-3 rounded-full bg-white/5">
                                                <Star className="w-6 h-6 text-gray-700" />
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{language === "sw" ? "Hujatengeneza kodi bado" : "No active code found"}</p>
                                        </div>
                                        <Button
                                            className="w-full h-16 bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                                            onClick={handleGenerate}
                                            disabled={isGenerating}
                                        >
                                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
                                            {t.generate_code}
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Leaderboard Section */}
                    <div className="lg:col-span-1">
                        <Card className="bg-white/5 border-white/10 backdrop-blur-xl h-full overflow-hidden border-t-yellow-500/30">
                            <CardHeader className="pb-4 bg-yellow-500/5 border-b border-white/5">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
                                        <Trophy className="h-4 w-4 text-yellow-500" />
                                        {t.top_referrers}
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {leaderboard.length === 0 ? (
                                    <div className="p-12 text-center text-gray-500 space-y-3">
                                        <Medal className="h-8 w-8 mx-auto opacity-20" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest">{language === "sw" ? "Bado hakuna takwimu" : "No rankings yet"}</p>
                                        <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                                            <p className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">
                                                {language === "sw" ? `Shinda Sarafu ${referralInfo.kingBonusCoins} 👑` : `Win ${referralInfo.kingBonusCoins} Coins 👑`}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {leaderboard.map((item, index) => (
                                            <motion.div
                                                key={item._id}
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.06 }}
                                                className={cn(
                                                    "p-4 flex items-center gap-4 transition-colors group",
                                                    item.isReferralKing
                                                        ? "bg-yellow-500/5 hover:bg-yellow-500/10"
                                                        : "hover:bg-white/[0.02]"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs",
                                                    index === 0 ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20" :
                                                        index === 1 ? "bg-gray-300 text-black shadow-lg shadow-gray-300/20" :
                                                            index === 2 ? "bg-orange-400 text-black shadow-lg shadow-orange-400/20" :
                                                                "bg-white/5 text-gray-500"
                                                )}>
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-white uppercase tracking-widest truncate flex items-center gap-1.5">
                                                        {item.name.charAt(0)}***{item.name.charAt(item.name.length - 1)}
                                                        {item.isReferralKing && (
                                                            <span className="text-yellow-400 text-sm" title="Referral King">👑</span>
                                                        )}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
                                                        {item.count} {t.referrals_count}
                                                    </p>
                                                </div>
                                                {item.isReferralKing ? (
                                                    <Crown className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />
                                                ) : index < 3 ? (
                                                    <Trophy className={cn(
                                                        "h-3.5 w-3.5",
                                                        index === 0 ? "text-yellow-500" :
                                                            index === 1 ? "text-gray-300" :
                                                                "text-orange-400"
                                                    )} />
                                                ) : null}
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                <div className="p-4 mt-2 space-y-3">
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
                                        <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-1">{language === "sw" ? "Kila mwaliko ni" : "Each referral is"}</p>
                                        <p className="text-sm font-black text-white">10 COINS 🪙</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-center">
                                        <p className="text-[9px] font-bold text-yellow-500/60 uppercase tracking-widest mb-1">
                                            {language === "sw" ? `Shinda Sarafu ${referralInfo.kingBonusCoins} 👑` : `Win ${referralInfo.kingBonusCoins} Coins 👑`}
                                        </p>
                                        <p className="text-[10px] font-bold text-yellow-400/80 leading-relaxed">
                                            {language === "sw"
                                                ? `Maalikaji bora kila wiki anatawazwa Mfalme na kupata sarafu ${referralInfo.kingBonusCoins} za bure 🪙 kila Jumapili otomatiki.`
                                                : `The top referrer every week gets crowned King and wins ${referralInfo.kingBonusCoins} bonus coins 🪙 automatically every Sunday.`}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div >

                {/* Instructions Section */}
                < div className="space-y-4 pt-4" >
                    <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold tracking-tight text-white uppercase">{language === "sw" ? "Jinsi inavyofanya kazi" : "How it works"}</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-3 relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 text-8xl font-black text-white group-hover:opacity-10 transition-opacity">1</div>
                            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black relative z-10">1</div>
                            <div className="relative z-10 space-y-1">
                                <h3 className="text-xs font-bold text-white uppercase tracking-widest">{t.generate_code}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                    {language === "sw" ? "Tengeneza kodi ya kipekee. Kodi ni ya kudumu na haishi muda wake." : "Create a unique 8-character code. Codes are permanent and never expire."}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-3 relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 text-8xl font-black text-white group-hover:opacity-10 transition-opacity">2</div>
                            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black relative z-10">2</div>
                            <div className="relative z-10 space-y-1">
                                <h3 className="text-xs font-bold text-white uppercase tracking-widest">{language === "sw" ? "Alika wengine" : "Share with others"}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                    {language === "sw" ? "Tuma kodi yako kwa marafiki. Lazima waiingize wakati wa kujisajili." : "Send your code to friends. They must enter it during registration."}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-3 relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 text-8xl font-black text-white group-hover:opacity-10 transition-opacity">3</div>
                            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black relative z-10">3</div>
                            <div className="relative z-10 space-y-1">
                                <h3 className="text-xs font-bold text-white uppercase tracking-widest">{language === "sw" ? "Pata Zawadi 🪙" : "Earn Rewards 🪙"}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                    {language === "sw" ? "Pata sarafu 10 kwa kila mtumiaji anayejisajili na kisha kufanya ununuzi wa kwanza." : "Get 10 coins for every user who registers and then makes their first purchase."}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md space-y-3 relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 text-8xl font-black text-yellow-400 group-hover:opacity-10 transition-opacity">👑</div>
                            <div className="h-8 w-8 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs font-black relative z-10">
                                <Crown className="w-4 h-4" />
                            </div>
                            <div className="relative z-10 space-y-1">
                                <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{t.king_how_it_works}</h3>
                                <p className="text-[10px] text-yellow-500/50 font-bold uppercase tracking-widest leading-relaxed">
                                    {language === "sw" ? `Maalikaji bora kila Jumapili anapata sarafu ${referralInfo.kingBonusCoins} + taji la Mfalme otomatiki.` : `The top referrer every Sunday wins ${referralInfo.kingBonusCoins} bonus coins + the King crown automatically.`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div >
            </div >
        </DashboardLayout >
    );
}
