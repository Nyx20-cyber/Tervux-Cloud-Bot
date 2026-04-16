"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Activity, ShieldCheck, RefreshCcw, Network, Coins, Rocket, Megaphone, Info, AlertTriangle, Wrench, Sparkles, Tag, GraduationCap, PlayCircle, ExternalLink, CheckCircle2, Users, Radio } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { api } from "@/store/useAuthStore";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Loader2, TrendingUp, CreditCard, UserPlus, Bell, Settings, ArrowUpRight, History } from "lucide-react";
import { MessageCircle, Users, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOnboardingUIStore } from "@/store/useOnboardingUIStore";

interface AnnouncementRecord {
    _id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "maintenance" | "update" | "promo";
    isActive: boolean;
    createdBy?: { name?: string };
    createdAt: string;
}

interface DashboardStats {
    referralGrowth: { date: string, count: number }[];
    coinUsage: { date: string, amount: number }[];
    summary: { totalCoins: number, referralCount: number };
}

interface TutorialRecord {
    _id: string;
    title: string;
    description: string;
    youtubeUrl: string;
    youtubeVideoId: string;
}

const OFFICIAL_GROUP_LINK =
    process.env.NEXT_PUBLIC_OFFICIAL_GROUP_INVITE_LINK || "https://chat.whatsapp.com/CAmxN3oOVxwGmoyYO0NfQv";
const OFFICIAL_CHANNEL_LINK =
    process.env.NEXT_PUBLIC_OFFICIAL_CHANNEL_LINK || "https://whatsapp.com/channel/0029Vb6z2Hp7YSczTRHtmr0N";

export default function DashboardPage() {
    const { sessions, isLoading, fetchSessions, updateSessionLocally } = useSessionStore();
    const { user, token, authReady, isAuthenticated, setUser } = useAuthStore();
    const setTutorialPromptOpen = useOnboardingUIStore((state) => state.setTutorialPromptOpen);
    const setTutorialPromptCheckComplete = useOnboardingUIStore((state) => state.setTutorialPromptCheckComplete);
    const resetTutorialPromptState = useOnboardingUIStore((state) => state.resetTutorialPromptState);
    const { language } = useLocaleStore();
    const router = useRouter();
    const t = translations[language];
    const tr = (key: keyof typeof translations.en, vars?: Record<string, string | number>) => {
        const template = String(t[key] ?? translations.en[key] ?? "");
        if (!vars) return template;
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), template);
    };
    const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
    const [referralBonus, setReferralBonus] = useState(10);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [tutorials, setTutorials] = useState<TutorialRecord[]>([]);
    const [tutorialPrompt, setTutorialPrompt] = useState<TutorialRecord | null>(null);
    const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
    const [hasEvaluatedTutorialPrompt, setHasEvaluatedTutorialPrompt] = useState(false);
    const [hasLoadedTutorials, setHasLoadedTutorials] = useState(false);
    const [tutorialBannerEnabled, setTutorialBannerEnabled] = useState(true);
    const [tutorialBannerTutorialId, setTutorialBannerTutorialId] = useState<string | null>(null);
    const isMaintenanceError = (err: any) => err?.response?.status === 503 && err?.response?.data?.maintenance;
    const tutorialPromptCopy = language === "sw"
        ? {
            badge: "Anzia Hapa",
            title: "Tazama Video Hii Kwanza",
            description: "Tumekuandalia tutorial fupi ya kukuonyesha jinsi ya kuconnect akaunti yako, kudeploy bot, na kuendelea na setup bila kubahatisha.",
            primary: "Fungua Tutorials",
            secondary: "Nimeona",
            watchOnYoutube: "Tazama YouTube",
            bannerBadge: "Video Guide",
            bannerTitle: "Unahitaji msaada wa kuconnect bot?",
            bannerDescription: "Anza na tutorial hii kisha uendelee na hatua zilizofuata.",
            bannerPrimary: "Tazama Hapa"
        }
        : {
            badge: "Start Here",
            title: "Watch This Tutorial First",
            description: "We prepared a short tutorial to show you how to connect your account, deploy your bot, and continue setup without guessing.",
            primary: "Open Tutorials",
            secondary: "Got It",
            watchOnYoutube: "Watch on YouTube",
            bannerBadge: "Video Guide",
            bannerTitle: "Need help connecting your bot?",
            bannerDescription: "Start with this tutorial, then continue with the next steps.",
            bannerPrimary: "Watch Here"
        };

    const featuredTutorial = useMemo(() => {
        if (tutorials.length === 0) return null;
        return tutorials.find((tutorial) => tutorial._id === tutorialBannerTutorialId) || tutorials[0] || null;
    }, [tutorials, tutorialBannerTutorialId]);

    useEffect(() => {
        if (!authReady || !isAuthenticated || !token || !user) return;

        if (process.env.NODE_ENV !== "production") {
            console.info("[Auth][Dashboard] Starting protected dashboard fetches.", {
                hasToken: Boolean(token),
                userId: user?._id || null,
            });
        }

        fetchSessions();

        const fetchAnnouncements = async () => {
            try {
                const res = await api.get("/announcements");
                setAnnouncements(res.data.announcements);
            } catch (err) {
                if ((err as any)?.authHandled) return;
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch announcements:", err);
                }
            }
        };
        fetchAnnouncements();

        const fetchReferralInfo = async () => {
            try {
                const res = await api.get("/referral");
                setReferralBonus(res.data.referralBonus || 10);
            } catch (err) {
                if ((err as any)?.authHandled) return;
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch referral info:", err);
                }
            }
        };
        fetchReferralInfo();

        const fetchDashboardStats = async () => {
            try {
                const res = await api.get("/dashboard/stats");
                setStats(res.data);
            } catch (err) {
                if ((err as any)?.authHandled) return;
                if (!isMaintenanceError(err)) {
                    console.error("Failed to fetch dashboard stats:", err);
                }
            } finally {
                setIsStatsLoading(false);
            }
        };
        fetchDashboardStats();

        const fetchBannerConfig = async () => {
            try {
                const res = await api.get("/config");
                setTutorialBannerEnabled(res.data?.tutorialBannerEnabled !== false);
                setTutorialBannerTutorialId(res.data?.tutorialBannerTutorialId || null);
            } catch (err) {
                if (!(err as any)?.authHandled && !isMaintenanceError(err)) {
                    console.error("Failed to fetch banner config:", err);
                }
            }
        };
        fetchBannerConfig();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("session_update", (data: { sessionId: string; status: string; isLive?: boolean }) => {
            updateSessionLocally(data.sessionId, { status: data.status, isLive: data.isLive });
        });

        socket.on("balance_update", (data: { coins: number }) => {
            const currentUser = useAuthStore.getState().user;
            const setUser = useAuthStore.getState().setUser;
            if (currentUser) {
                setUser({ ...currentUser, coins: data.coins });
            }
        });

        socket.on("platform_settings_updated", (payload: {
            tutorialBannerEnabled?: boolean;
            tutorialBannerTutorialId?: string | null;
        }) => {
            if (typeof payload?.tutorialBannerEnabled === "boolean") {
                setTutorialBannerEnabled(payload.tutorialBannerEnabled);
            }
            if (payload?.tutorialBannerTutorialId !== undefined) {
                setTutorialBannerTutorialId(payload.tutorialBannerTutorialId || null);
            }
        });

        socket.on("tutorials_updated", async () => {
            try {
                const res = await api.get("/tutorials");
                setTutorials(res.data?.tutorials || []);
            } catch (error) {
                if (!(error as any)?.authHandled) {
                    console.error("Failed to refresh tutorials:", error);
                }
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, updateSessionLocally, token, user, authReady, isAuthenticated]);

    useEffect(() => {
        resetTutorialPromptState();
        setTutorials([]);
        setTutorialPrompt(null);
        setShowTutorialPrompt(false);
        setHasEvaluatedTutorialPrompt(false);
        setHasLoadedTutorials(false);
    }, [user?._id, resetTutorialPromptState]);

    useEffect(() => {
        setTutorialPromptOpen(showTutorialPrompt);
    }, [showTutorialPrompt, setTutorialPromptOpen]);

    useEffect(() => {
        if (!authReady || !isAuthenticated) {
            return;
        }

        let cancelled = false;
        const loadFeaturedTutorial = async () => {
            try {
                const res = await api.get("/tutorials");
                if (!cancelled) {
                    setTutorials(res.data?.tutorials || []);
                    setHasLoadedTutorials(true);
                }
            } catch (error) {
                if (!(error as any)?.authHandled) {
                    console.error("Failed to load featured tutorial:", error);
                }
                if (!cancelled) {
                    setHasLoadedTutorials(true);
                }
            }
        };

        loadFeaturedTutorial();

        return () => {
            cancelled = true;
        };
    }, [authReady, isAuthenticated, user?._id]);

    useEffect(() => {
        if (!authReady || !isAuthenticated || !user || isLoading || hasEvaluatedTutorialPrompt) {
            return;
        }

        if (user.role !== "user") {
            setTutorialPromptCheckComplete(true);
            setHasEvaluatedTutorialPrompt(true);
            return;
        }

        if (!hasLoadedTutorials) {
            return;
        }

        const accountAgeMs = user.createdAt ? Date.now() - new Date(user.createdAt).getTime() : Number.POSITIVE_INFINITY;
        const isNewAccount = Number.isFinite(accountAgeMs) && accountAgeMs <= 7 * 24 * 60 * 60 * 1000;
        const isTutorialCandidate =
            isNewAccount &&
            !user.tutorialOnboardingSeenAt &&
            (user.totalDeployments || 0) === 0 &&
            sessions.length === 0;

        if (!isTutorialCandidate) {
            setTutorialPromptCheckComplete(true);
            setHasEvaluatedTutorialPrompt(true);
            return;
        }

        setTutorialPrompt(featuredTutorial ?? null);
        setShowTutorialPrompt(true);
        setTutorialPromptCheckComplete(true);
        setHasEvaluatedTutorialPrompt(true);
    }, [authReady, isAuthenticated, user, isLoading, sessions.length, hasEvaluatedTutorialPrompt, featuredTutorial, hasLoadedTutorials, setTutorialPromptCheckComplete]);

    const markTutorialPromptSeen = async () => {
        if (!user || user.tutorialOnboardingSeenAt) return;
        try {
            const res = await api.post("/auth/tutorial-onboarding/seen");
            if (res.data?.user) {
                setUser(res.data.user);
                return;
            }
        } catch (error) {
            if (!(error as any)?.authHandled) {
                console.error("Failed to mark tutorial onboarding prompt as seen:", error);
            }
        }

        setUser({
            ...user,
            tutorialOnboardingSeenAt: new Date().toISOString()
        });
    };

    const handleTutorialPromptClose = async () => {
        setShowTutorialPrompt(false);
        await markTutorialPromptSeen();
    };

    const handleTutorialPromptOpenTutorials = async () => {
        setShowTutorialPrompt(false);
        await markTutorialPromptSeen();
        router.push("/dashboard/tutorials");
    };

    const activeSessionsCount = sessions.filter(s => s.status === "active").length;

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const shortcuts = [
        { icon: CreditCard, label: t.shortcut_topup, path: "/dashboard/billing", color: "text-emerald-400", bg: "bg-emerald-400/10" },
        { icon: UserPlus, label: t.shortcut_refer, path: "/dashboard/referrals", color: "text-violet-400", bg: "bg-violet-400/10" },
        { icon: Rocket, label: t.shortcut_deploy, path: "/dashboard/deployments", color: "text-primary", bg: "bg-primary/10" },
        { icon: Bell, label: t.shortcut_alerts, path: "/dashboard/notifications", color: "text-orange-400", bg: "bg-orange-400/10" },
        { icon: Settings, label: t.shortcut_settings, path: "/dashboard/configurations", color: "text-blue-400", bg: "bg-blue-400/10" },
        { icon: History, label: t.shortcut_usage, path: "/dashboard/billing", color: "text-gray-400", bg: "bg-gray-400/10" },
    ];

    return (
        <DashboardLayout>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-6 sm:space-y-8 max-w-7xl mx-auto"
            >
                <Dialog open={showTutorialPrompt} onOpenChange={(open) => { if (!open) void handleTutorialPromptClose(); }}>
                    <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl lg:max-w-[1040px] xl:max-w-[1100px] max-h-[92vh] overflow-hidden border-white/10 bg-[#0d0f14] text-white rounded-[1.75rem] sm:rounded-[2rem] p-0 shadow-2xl">
                        <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[minmax(330px,0.9fr)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,0.92fr)_minmax(0,1fr)] custom-scrollbar">
                            <div className="border-b border-white/10 p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6 xl:p-7">
                                <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-black/40 to-black/20 p-3 sm:p-4 lg:flex lg:h-full lg:flex-col lg:justify-center lg:bg-gradient-to-br lg:from-black/55 lg:via-[#11131a] lg:to-black/25 lg:rounded-[1.7rem] lg:p-4 xl:p-5">
                                    <div className="mb-3 flex items-center justify-between gap-3 lg:mb-5">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                                            <GraduationCap className="h-3.5 w-3.5" />
                                            {tutorialPromptCopy.badge}
                                        </div>
                                        {tutorialPrompt?.youtubeUrl && (
                                            <a
                                                href={tutorialPrompt.youtubeUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300 hover:bg-cyan-400/15"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                {tutorialPromptCopy.watchOnYoutube}
                                            </a>
                                        )}
                                    </div>

                                    <div className="rounded-[1.25rem] sm:rounded-[1.5rem] overflow-hidden border border-white/10 bg-black/40 aspect-[9/16] w-full max-w-[240px] sm:max-w-[280px] lg:max-w-[320px] xl:max-w-[340px] mx-auto lg:shadow-[0_24px_55px_rgba(0,0,0,0.34)]">
                                    {tutorialPrompt ? (
                                        <iframe
                                            className="w-full h-full"
                                            src={`https://www.youtube.com/embed/${tutorialPrompt.youtubeVideoId}`}
                                            title={tutorialPrompt.title}
                                            loading="lazy"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-5 text-center">
                                            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                                                <GraduationCap className="h-6 w-6 sm:h-7 sm:w-7" />
                                            </div>
                                            <div>
                                                <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-white">
                                                    {tutorialPromptCopy.badge}
                                                </p>
                                                <p className="mt-2 text-[11px] sm:text-xs leading-relaxed text-gray-400">
                                                    {tutorialPromptCopy.description}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col p-4 sm:p-5 lg:min-h-full lg:p-6 xl:p-7">
                                <DialogHeader className="space-y-3 text-left lg:space-y-4">
                                    <DialogTitle className="text-lg sm:text-2xl lg:text-[1.6rem] font-black uppercase tracking-tight text-white leading-tight">
                                        {tutorialPromptCopy.title}
                                    </DialogTitle>
                                    <DialogDescription className="text-sm sm:text-[15px] lg:max-w-xl lg:text-sm leading-relaxed text-gray-300">
                                        {tutorialPromptCopy.description}
                                    </DialogDescription>
                                </DialogHeader>

                                {tutorialPrompt && (
                                    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5 space-y-3 lg:mt-6 lg:rounded-[1.7rem] lg:p-5 lg:space-y-3.5">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-cyan-300">
                                            <PlayCircle className="w-3.5 h-3.5" />
                                            Tutorial
                                        </div>
                                        <h3 className="text-sm sm:text-lg lg:text-[1.05rem] font-black uppercase tracking-tight text-white leading-snug">
                                            {tutorialPrompt.title}
                                        </h3>
                                        <p className="text-xs sm:text-sm lg:text-[13px] leading-relaxed text-gray-400">
                                            {tutorialPrompt.description}
                                        </p>
                                        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2 lg:gap-3 lg:pt-2">
                                            <Button
                                                type="button"
                                                onClick={() => { void handleTutorialPromptOpenTutorials(); }}
                                                className="w-full rounded-2xl bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-[0.16em] text-[10px] sm:text-xs lg:min-h-[3rem] lg:text-[11px] lg:shadow-[0_16px_35px_rgba(34,197,94,0.18)]"
                                            >
                                                {tutorialPromptCopy.primary}
                                            </Button>
                                            <a
                                                href={tutorialPrompt.youtubeUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/35 bg-cyan-400/12 px-4 py-3 text-[10px] sm:text-xs font-black uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-400/18 lg:min-h-[3rem] lg:text-[11px] lg:shadow-[0_16px_35px_rgba(34,211,238,0.12)]"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                {tutorialPromptCopy.watchOnYoutube}
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {!tutorialPrompt && (
                                    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5 lg:mt-6 lg:rounded-[1.7rem] lg:p-5">
                                        <p className="text-xs sm:text-sm lg:text-[13px] leading-relaxed text-gray-400">
                                            {language === "sw"
                                                ? "Fungua ukurasa wa Tutorials ili uanze kuangalia video za hatua kwa hatua kabla hujaendelea kuconnect na kudeploy bot yako."
                                                : "Open the Tutorials page to start with step-by-step videos before you continue connecting and deploying your bot."}
                                        </p>
                                    </div>
                                )}

                                <DialogFooter className="mt-5 sm:mt-auto pt-2 lg:pt-4 flex-col-reverse sm:flex-row gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { void handleTutorialPromptClose(); }}
                                        className="group relative flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-yellow-500 px-6 py-3.5 text-xs font-semibold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(234,179,8,0.2)] transition-all hover:bg-yellow-400 hover:shadow-[0_0_40px_rgba(234,179,8,0.4)] hover:-translate-y-1 active:scale-[0.985] sm:w-auto sm:min-w-[200px] sm:px-8 sm:py-4 sm:text-sm"
                                    >
                                        <CheckCircle2 className="h-4 w-4 shrink-0 group-hover:scale-110 transition-transform sm:h-5 sm:w-5" />
                                        {tutorialPromptCopy.secondary}
                                        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                                            <span className="absolute inset-0 h-full w-[200%] -translate-x-[100%] bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
                                        </span>
                                    </button>
                                    {!tutorialPrompt && (
                                        <Button
                                            type="button"
                                            onClick={() => { void handleTutorialPromptOpenTutorials(); }}
                                            className="w-full sm:w-auto rounded-2xl bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-widest lg:min-w-[190px] lg:text-[11px] lg:shadow-[0_16px_35px_rgba(34,197,94,0.18)]"
                                        >
                                            {tutorialPromptCopy.primary}
                                        </Button>
                                    )}
                                </DialogFooter>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Modern Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                    <motion.div variants={itemVariants}>
                        <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-2.5 sm:gap-4">
                            <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-primary/10 border border-primary/20">
                                <Activity className="h-5 w-5 sm:h-8 sm:w-8 text-primary" />
                            </div>
                            <span className="bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">{t.dashboard}</span>
                        </h1>
                        <p className="text-[9px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest mt-1.5 sm:mt-2 ml-1 opacity-70">
                            {t.dashboard_central_command}
                        </p>
                    </motion.div>

                    <motion.div variants={itemVariants} className="flex items-center gap-3 p-1.5 pr-4 sm:pr-6 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl w-fit">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center font-black text-black text-xs sm:text-sm">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <div>
                            <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">{t.welcome_back}</p>
                            <p className="text-xs sm:text-sm font-black text-white uppercase tracking-tight">{user?.name || t.member}</p>
                        </div>
                    </motion.div>
                </div>

                <motion.div variants={itemVariants}>
                    <div className="relative overflow-hidden rounded-[26px] p-[1.5px] shadow-[0_0_40px_rgba(37,211,102,0.08)]">
                        <motion.div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-[26px]"
                            style={{
                                background: "conic-gradient(from 0deg, rgba(37,211,102,0.10), rgba(37,211,102,1), rgba(16,185,129,0.55), rgba(37,211,102,0.14), rgba(37,211,102,0.10))"
                            }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
                        />
                        <div className="relative overflow-hidden rounded-[25px] border border-emerald-400/15 bg-gradient-to-r from-[#0d1f16] via-[#0a1510] to-[#07120d] backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-4.5">
                            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
                            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl" />
                            <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-emerald-500/10 blur-3xl" />
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/12 p-2.5 text-emerald-300 shrink-0 shadow-[0_0_22px_rgba(34,197,94,0.16)]">
                                        <MessageCircle className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                                            <Radio className="h-3.5 w-3.5" />
                                            <span className="inline-flex items-center gap-1.5">
                                                <MessageCircle className="h-3.5 w-3.5" />
                                                Community
                                            </span>
                                            {t.community_badge_label}
                                        </div>
                                        <h2 className="mt-2 text-sm sm:text-base font-black tracking-tight text-white">
                                            {t.community_badge_title}
                                        </h2>
                                        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-300 max-w-2xl">
                                            {t.community_badge_desc}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                                    <a
                                        href={OFFICIAL_GROUP_LINK}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/12 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 shadow-[0_0_18px_rgba(34,197,94,0.12)] hover:bg-emerald-400/18"
                                    >
                                        <Users className="h-3.5 w-3.5" />
                                        {t.join_whatsapp_group}
                                    </a>
                                    <a
                                        href={OFFICIAL_CHANNEL_LINK}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-white/[0.03] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white hover:bg-white/[0.06]"
                                    >
                                        <Radio className="h-3.5 w-3.5 text-emerald-300" />
                                        {t.follow_whatsapp_channel}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {tutorialBannerEnabled && featuredTutorial && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                >
                    <div className="rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/12 via-emerald-500/8 to-transparent backdrop-blur-2xl px-3.5 py-3.5 sm:px-4 sm:py-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="shrink-0 rounded-full border border-primary/20 bg-primary/12 p-2.5 text-primary">
                                    <GraduationCap className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                                </div>

                                <div className="min-w-0">
                                    <motion.div
                                        animate={{ scale: [1, 1.06, 1] }}
                                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        className="inline-flex max-w-full self-start items-center gap-1.5 sm:gap-2 rounded-full border border-primary/25 bg-primary/10 px-2 sm:px-2.5 py-1 text-[8px] sm:text-[9px] font-black uppercase leading-none tracking-[0.12em] sm:tracking-[0.18em] text-primary"
                                    >
                                        <PlayCircle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                                        {tutorialPromptCopy.bannerBadge}
                                    </motion.div>
                                    <h2 className="mt-2 text-sm sm:text-base font-black tracking-tight text-white">
                                        {tutorialPromptCopy.bannerTitle}
                                    </h2>
                                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-300">
                                        {tutorialPromptCopy.bannerDescription}
                                    </p>
                                    {featuredTutorial && (
                                        <p className="mt-1.5 truncate text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] text-emerald-300/90">
                                            {featuredTutorial.title}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
                                {featuredTutorial?.youtubeUrl && (
                                    <a
                                        href={featuredTutorial.youtubeUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 hover:bg-emerald-400/15"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        {tutorialPromptCopy.watchOnYoutube}
                                    </a>
                                )}
                                <Button
                                    type="button"
                                    onClick={() => router.push("/dashboard/tutorials")}
                                    className="w-full sm:w-auto rounded-xl bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-primary/90"
                                >
                                    {tutorialPromptCopy.bannerPrimary}
                                </Button>
                            </div>
                        </div>
                    </div>
                </motion.div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        { icon: Coins, label: t.stat_coin_balance, value: user?.coins || 0, color: "text-yellow-500", detail: "🪙", pulse: true },
                        { icon: ShieldCheck, label: t.encryption, value: "AES-256", color: "text-sky-400", detail: "🔐" },
                        { icon: RefreshCcw, label: t.uptime, value: "99.9%", color: "text-emerald-400", detail: "⚡" },
                        { icon: Network, label: t.stat_active_bots, value: activeSessionsCount, color: "text-primary", detail: "🤖" },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            whileHover={{ scale: 1.02, y: -2 }}
                            className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0A0A0A]/40 backdrop-blur-2xl relative overflow-hidden group"
                        >
                            <div className={`absolute top-0 right-0 p-2 sm:p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                                <stat.icon size={64} />
                            </div>
                            <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color} mb-2.5 sm:mb-4 ${stat.pulse ? 'animate-pulse' : ''}`} />
                            <div className="space-y-1 relative z-10">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{stat.label}</p>
                                <p className="text-lg sm:text-2xl font-black text-white tracking-tight">
                                    {stat.value} <span className="text-xs sm:text-sm opacity-50 ml-1">{stat.detail}</span>
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Interactive Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <motion.div variants={itemVariants} className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-3xl min-h-[300px] sm:min-h-[350px] relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-5 sm:mb-8">
                            <div>
                                <h3 className="text-[11px] sm:text-sm font-black text-white uppercase tracking-[0.16em] sm:tracking-[0.2em]">{t.referral_growth}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.last_7_days_activity}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                                <TrendingUp size={16} />
                            </div>
                        </div>

                        {isStatsLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats?.referralGrowth || []}>
                                        <defs>
                                            <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                        <XAxis dataKey="date" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                            itemStyle={{ color: '#8b5cf6', fontSize: '12px', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorRef)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </motion.div>

                    <motion.div variants={itemVariants} className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-3xl min-h-[300px] sm:min-h-[350px] relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5 sm:mb-8">
                            <div>
                                <h3 className="text-[11px] sm:text-sm font-black text-white uppercase tracking-[0.16em] sm:tracking-[0.2em]">{t.coin_purchase_trend}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.daily_investment_recap}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                <Coins size={16} />
                            </div>
                        </div>

                        {isStatsLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 className="animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats?.coinUsage || []}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                        <XAxis dataKey="date" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                            itemStyle={{ color: '#00f2ff', fontSize: '12px', fontWeight: 'bold' }}
                                        />
                                        <Line type="stepAfter" dataKey="amount" stroke="#00f2ff" strokeWidth={3} dot={{ r: 4, fill: '#00f2ff' }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Quick Shortcuts */}
                <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2 px-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h2 className="text-xs font-black text-white uppercase tracking-[0.3em] opacity-60">
                            {t.quick_commands}
                        </h2>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 sm:gap-4">
                        {shortcuts.map((s, i) => (
                            <Link key={i} href={s.path}>
                                <motion.div
                                    variants={itemVariants}
                                    whileHover={{ y: -5, scale: 1.02 }}
                                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5 bg-[#0D0D0D]/40 backdrop-blur-xl flex flex-col items-center text-center gap-2 sm:gap-3 group hover:bg-white/5 transition-colors"
                                >
                                    <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${s.bg} ${s.color} group-hover:scale-110 transition-transform`}>
                                        <s.icon size={16} />
                                    </div>
                                    <span className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest group-hover:text-white transition-colors leading-tight">
                                        {s.label}
                                    </span>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8 pb-10 sm:pb-12">
                    <div className="lg:col-span-2 space-y-5 sm:space-y-8">
                        {/* Announcements Section */}
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-center gap-2 px-2">
                                <Megaphone className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                <h2 className="text-sm sm:text-lg font-black tracking-tight text-white uppercase">{t.broadcasts}</h2>
                            </div>
                            <div className="grid gap-4">
                                {announcements.length === 0 ? (
                                    <div className="p-5 sm:p-8 text-center border border-white/5 rounded-2xl sm:rounded-3xl bg-white/5">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.no_active_broadcasts}</p>
                                    </div>
                                ) : announcements.map((announcement) => {
                                    const tc = typeConfig[announcement.type] || typeConfig.info;
                                    const Icon = tc.icon;
                                    return (
                                        <motion.div key={announcement._id} variants={itemVariants} className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border ${tc.border} bg-[#0D0D0D]/40 backdrop-blur-xl flex gap-3 sm:gap-5 items-start hover:bg-[#111] transition-colors group`}>
                                            <div className={`p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-black/60 border ${tc.border} shrink-0 group-hover:scale-110 transition-transform`}>
                                                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${tc.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-2">
                                                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wide">{announcement.title}</h3>
                                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">{new Date(announcement.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[10px] sm:text-[11px] text-white/60 font-medium leading-relaxed">{announcement.message}</p>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Quick Tip Premium */}
                        <motion.div
                            variants={itemVariants}
                            whileHover={{ scale: 1.01 }}
                            className="p-8 rounded-[2.5rem] border border-primary/20 bg-primary/5 space-y-6 relative overflow-hidden group"
                        >
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">{t.quick_tip}</h3>
                            </div>
                            <p className="text-xs text-white/80 font-medium leading-[1.8] relative z-10">
                                {tr("invite_friends_dynamic", { amount: referralBonus })}
                            </p>
                            <Button asChild variant="link" className="p-0 h-auto text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:gap-2 transition-all">
                                <Link href="/dashboard/referrals" className="flex items-center gap-2">
                                    {t.referrals} <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            </Button>
                        </motion.div>

                        <motion.div variants={itemVariants} className="p-8 rounded-[2.5rem] border border-white/5 bg-[#0D0D0D]/60 backdrop-blur-xl group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                                    <Wrench className="h-5 w-5 text-gray-400" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">{t.support}</h3>
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] leading-relaxed mb-6">
                                {t.support_desc}
                            </p>
                            <div className="p-5 rounded-2xl bg-black/40 border border-white/5 text-center group-hover:border-emerald-500/20 transition-colors">
                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-1">{t.service_status}</p>
                                <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t.operational}
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </DashboardLayout>
    );
}

const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: "text-sky-400", bg: "bg-sky-500/5", border: "border-sky-500/10" },
    warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/10" },
    maintenance: { icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/10" },
    update: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/5", border: "border-violet-500/10" },
    promo: { icon: Tag, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/10" },
};
