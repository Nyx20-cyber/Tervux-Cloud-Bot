"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { api } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Settings2,
    Save,
    RotateCcw,
    Smartphone,
    Search,
    Bot,
    Loader2,
    Settings,
    ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { useAuthStore } from "@/store/useAuthStore";

interface Session {
    _id: string;
    phone?: string;
    settings?: Record<string, string | number | boolean | null>;
    status: string;
    expiresAt?: string | null;
    isLive?: boolean;
    updatedAt: string;
}

function ConfigurationsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionIdParam = searchParams.get("session");
    const { language } = useLocaleStore();
    const user = useAuthStore((s) => s.user);
    const t = translations[language];
    const isAdmin = user?.role === "admin";
    const restrictedSettingKeys = new Set([
        "groupPromotionBroadcast",
        "officialGroupJoined",
        "officialChannelFollowed",
        "officialChannelFollowBlocked",
        "officialGroupJoinBlocked"
    ]);

    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [config, setConfig] = useState<Record<string, string | number | boolean | null>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const cloneSettings = (value?: Record<string, string | number | boolean | null>) => JSON.parse(JSON.stringify(value || {})) as Record<string, string | number | boolean | null>;

    const fetchSessions = useCallback(async () => {
        try {
            const res = await api.get("/sessions");
            // Show only deployed + non-expired bots for configuration.
            const now = Date.now();
            const deployedBots = res.data.sessions
                ? (res.data.sessions as Session[]).filter((s) =>
                    s.expiresAt &&
                    new Date(s.expiresAt).getTime() > now &&
                    s.status !== "pairing"
                )
                : [];
            setSessions(deployedBots);
            setIsLoading(false);
        } catch {
            toast.error(t.failed_fetch_sessions);
            setIsLoading(false);
        }
    }, [t.failed_fetch_sessions]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    useEffect(() => {
        if (sessionIdParam && sessions.length > 0) {
            const session = sessions.find(s => s._id === sessionIdParam);
            if (session) {
                setSelectedSession(session);
                setConfig(cloneSettings(session.settings));
            }
        }
    }, [sessionIdParam, sessions]);

    const handleSave = async () => {
        if (!selectedSession) return;
        setIsSaving(true);
        try {
            const payload = { ...config };
            if (!isAdmin) {
                for (const key of restrictedSettingKeys) {
                    if (selectedSession.settings && Object.prototype.hasOwnProperty.call(selectedSession.settings, key)) {
                        payload[key] = selectedSession.settings[key];
                    } else {
                        delete payload[key];
                    }
                }
            }
            const res = await api.put(`/sessions/${selectedSession._id}/settings`, payload);
            const savedSettings = cloneSettings(res.data?.settings || config);
            setConfig(savedSettings);
            setSelectedSession(prev => prev ? { ...prev, settings: savedSettings } : prev);
            setSessions(prev => prev.map(s => s._id === selectedSession._id ? { ...s, settings: savedSettings } : s));
            toast.success(t.configurations_saved);
            setIsConfirmOpen(false);
            fetchSessions();
        } catch {
            toast.error(t.failed_save_configurations);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredSessions = sessions.filter(s =>
        (s.phone || "").includes(searchTerm)
    );

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-2.5 sm:gap-3">
                            <Settings2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                            {t.bot_configurations}
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{t.customize_deployed}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
                    {/* Session Sidebar */}
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-white/5 border border-white/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl backdrop-blur-md space-y-3 sm:space-y-4">
                            <div className="relative group">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder={t.search_sessions}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 h-10 bg-black/20 border-white/10 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-widest rounded-xl focus-visible:ring-primary"
                                />
                            </div>

                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {isLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                                ) : filteredSessions.length === 0 ? (
                                    <p className="text-center py-8 text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t.no_bots_found}</p>
                                ) : (
                                    filteredSessions.map((session) => (
                                        <button
                                            key={session._id}
                                            onClick={() => {
                                                setSelectedSession(session);
                                                setConfig(cloneSettings(session.settings));
                                                router.push(`/dashboard/configurations?session=${session._id}`);
                                            }}
                                            className={cn(
                                                "w-full p-3 sm:p-4 rounded-xl flex items-center justify-between transition-all border",
                                                selectedSession?._id === session._id
                                                    ? "bg-primary border-primary text-black"
                                                    : "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                <div className="text-left">
                                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">{session.phone || "-"}</p>
                                                    <p className={cn("text-[8px] font-bold uppercase tracking-tighter opacity-60", selectedSession?._id === session._id ? "text-black" : "text-gray-500")}>
                                                        {t.last_updated}: {new Date(session.updatedAt).toLocaleDateString(language === "sw" ? 'sw-TZ' : 'en-US')}
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Configuration Area */}
                    <div className="lg:col-span-8">
                        {selectedSession ? (
                            <div className="bg-white/5 border border-white/10 p-4 sm:p-8 rounded-xl sm:rounded-2xl backdrop-blur-md space-y-6 sm:space-y-8">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-white/10 pb-4 sm:pb-6">
                                    <div>
                                        <h3 className="text-base sm:text-xl font-bold text-white uppercase tracking-tight">{t.settings_for} {selectedSession.phone || "-"}</h3>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1">{t.status_label}: {selectedSession.status}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfig(cloneSettings(selectedSession.settings))}
                                        className="border-white/10 text-white font-bold uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl hover:bg-white/10"
                                    >
                                        <RotateCcw className="w-3 h-3 mr-2" />
                                        {t.reset_changes}
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                    {Object.entries(config).map(([key, value]) => (
                                        <div key={key} className="space-y-3">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                                {key.replace(/([A-Z])/g, ' $1').toUpperCase()}
                                            </label>
                                            <div className="relative">
                                                {typeof value === "boolean" ? (
                                                    (() => {
                                                        const isRestricted = !isAdmin && restrictedSettingKeys.has(key);
                                                        return (
                                                    <div className={cn(
                                                        "flex items-center gap-2 bg-black/20 border border-white/10 p-1.5 rounded-xl h-11 transition-opacity",
                                                        isRestricted && "opacity-45 saturate-50"
                                                    )}>
                                                        <button
                                                            onClick={() => setConfig({ ...config, [key]: true })}
                                                            disabled={isRestricted}
                                                            className={cn(
                                                            "flex-1 h-full rounded-lg transition-all font-bold text-[8px] sm:text-[9px] uppercase tracking-widest",
                                                                isRestricted && "opacity-50 cursor-not-allowed pointer-events-none",
                                                                config[key] ? "bg-primary text-black" : "text-gray-500 hover:text-white"
                                                            )}
                                                        >
                                                            ON
                                                        </button>
                                                        <button
                                                            onClick={() => setConfig({ ...config, [key]: false })}
                                                            disabled={isRestricted}
                                                            className={cn(
                                                            "flex-1 h-full rounded-lg transition-all font-bold text-[8px] sm:text-[9px] uppercase tracking-widest",
                                                                isRestricted && "opacity-50 cursor-not-allowed pointer-events-none",
                                                                !config[key] ? "bg-destructive text-white" : "text-gray-500 hover:text-white"
                                                            )}
                                                        >
                                                            OFF
                                                        </button>
                                                    </div>
                                                        );
                                                    })()
                                                ) : (
                                                    <Input
                                                        value={typeof value === "number" ? value : typeof value === "string" ? value : ""}
                                                        onChange={e => setConfig({ ...config, [key]: e.target.value })}
                                                        className="h-11 bg-black/20 border-white/10 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl focus-visible:ring-primary"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-6 border-t border-white/10">
                                    <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                                        <DialogTrigger asChild>
                                            <Button className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-primary/20">
                                                <Save className="w-4 h-4 mr-2" />
                                                {t.save_configurations}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-card border-white/10 backdrop-blur-2xl text-white rounded-2xl p-6 max-w-sm">
                                            <DialogHeader className="space-y-3">
                                                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                                    <Settings className="w-6 h-6 text-primary" />
                                                </div>
                                                <DialogTitle className="text-xl font-bold uppercase tracking-tight">{t.confirm_configs}</DialogTitle>
                                                <DialogDescription className="text-gray-400 font-medium tracking-widest text-[9px] uppercase italic">
                                                    {t.confirm_configs_desc}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter className="mt-6 gap-3">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => setIsConfirmOpen(false)}
                                                    className="flex-1 h-11 text-gray-400 hover:text-white border-white/10 font-bold uppercase tracking-widest text-[9px] rounded-xl"
                                                >
                                                    {t.cancel}
                                                </Button>
                                                <Button
                                                    onClick={handleSave}
                                                    disabled={isSaving}
                                                    className="flex-1 h-11 bg-primary text-black font-bold uppercase tracking-widest text-[10px] rounded-xl"
                                                >
                                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t.confirm}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl text-center space-y-5 sm:space-y-6 min-h-[320px] sm:min-h-[400px] backdrop-blur-md">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Bot className="w-8 h-8 text-gray-600" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t.no_bot_selected}</h3>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[9px] max-w-xs mx-auto italic">
                                        {t.select_bot_manage}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

export default function ConfigurationsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        }>
            <ConfigurationsContent />
        </Suspense>
    );
}
