"use client";

import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { io } from "socket.io-client";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [banMessage, setBanMessage] = useState("");
    const [registrationEnabled, setRegistrationEnabled] = useState(true);
    const { login } = useAuthStore();
    const { language, setLanguage } = useLocaleStore();
    const t = translations[language];
    const router = useRouter();

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await api.get("/config", { params: { _t: Date.now() } });
                setRegistrationEnabled(res.data?.registrationEnabled !== false);
            } catch {
                setRegistrationEnabled(true);
            }
        };
        fetchConfig();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io"
        });

        socket.on("platform_settings_updated", (payload: { registrationEnabled?: boolean }) => {
            if (typeof payload?.registrationEnabled === "boolean") {
                setRegistrationEnabled(payload.registrationEnabled);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await api.post("/auth/login", { email, password });
            login(res.data.token, res.data.user);
            toast.success(t.successful_login);
            router.push("/dashboard");
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || t.invalid_credentials;
            if (error.response?.status === 403 || String(errorMsg).toLowerCase().includes("suspend") || String(errorMsg).toLowerCase().includes("bann")) {
                setBanMessage(errorMsg);
                setBanDialogOpen(true);
            } else {
                toast.error(errorMsg);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 animate-fade-in relative z-20 overflow-hidden bg-black">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full -z-10 animate-pulse transition-all duration-1000"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full -z-10"></div>

            {/* Language Toggle in Auth */}
            <div className="absolute top-4 right-4 sm:top-8 sm:right-8 z-50">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLanguage(language === "en" ? "sw" : "en")}
                    className="bg-white/5 border border-white/5 text-white font-medium uppercase tracking-[0.2em] text-[9px] sm:text-[10px] h-9 sm:h-11 px-3 sm:px-5 rounded-xl sm:rounded-2xl backdrop-blur-xl transition-all active:scale-95"
                >
                    <span className="mr-1.5 sm:mr-2 text-sm sm:text-base">{language === "en" ? "🇺🇸" : "🇹🇿"}</span>
                    {language === "en" ? "EN" : "SW"}
                </Button>
            </div>

            <div className="w-full max-w-sm sm:max-w-md p-5 sm:p-10 rounded-[1.6rem] sm:rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary/10 to-transparent rounded-[1.6rem] sm:rounded-[2.5rem] blur opacity-20 z-0 transition-opacity duration-500"></div>

                <div className="relative z-10 space-y-6 sm:space-y-8">
                    <div className="text-center space-y-4 sm:space-y-6">
                        <div className="flex justify-center">
                            <motion.div
                                animate={{
                                    scale: [1, 1.05, 1],
                                    opacity: [0.8, 1, 0.8]
                                }}
                                transition={{
                                    duration: 4,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                className="p-3.5 sm:p-5 rounded-2xl sm:rounded-[1.75rem] bg-primary/5 border border-primary/10 shadow-inner"
                            >
                                <ShieldCheck className="h-7 w-7 sm:h-10 sm:w-10 text-primary/80" />
                            </motion.div>
                        </div>
                        <div className="space-y-1.5">
                            <h1 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-[0.18em] sm:tracking-[0.25em] font-mono">{t.app_name}</h1>
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-[0.3em] opacity-80">{t.sign_in_account}</p>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6">
                        <div className="space-y-3.5 sm:space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-2 opacity-60">{t.email_address}</label>
                                <Input
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="h-11 sm:h-14 bg-white/[0.03] border-white/5 text-white placeholder:text-gray-700 focus-visible:ring-primary/40 focus-visible:border-primary/30 text-sm font-medium tracking-wide rounded-xl sm:rounded-2xl transition-all px-4 sm:px-6 outline-none shadow-inner"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-2 opacity-60">{t.password}</label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="h-11 sm:h-14 bg-white/[0.03] border-white/5 text-white placeholder:text-gray-700 focus-visible:ring-primary/40 focus-visible:border-primary/30 text-sm font-medium tracking-wide pr-11 sm:pr-14 rounded-xl sm:rounded-2xl transition-all px-4 sm:px-6 outline-none shadow-inner"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 sm:pr-6 flex items-center text-gray-600 hover:text-primary/70 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <Button type="submit" disabled={isLoading} className="w-full h-11 sm:h-14 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[10px] sm:text-[11px] rounded-xl sm:rounded-2xl shadow-xl shadow-primary/10 mt-2 transition-all active:scale-[0.98]">
                            {isLoading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> {t.signing_in}</> : t.sign_in}
                        </Button>
                    </form>

                    <div className="text-center pt-5 sm:pt-6 border-t border-white/[0.05]">
                        {registrationEnabled ? (
                            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                                {t.no_account} <Link href="/register" className="text-primary hover:text-primary/80 transition-colors ml-1.5 font-bold">{t.create_one}</Link>
                            </p>
                        ) : (
                            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                                {t.registration_closed_brief}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
                <DialogContent className="max-w-md border-red-500/30 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-red-300 flex items-center gap-2">
                            <motion.span
                                animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="inline-flex"
                            >
                                <AlertTriangle className="w-4 h-4 text-red-400" />
                            </motion.span>
                            {t.account_suspended_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {banMessage || t.account_suspended_login_notice}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-400">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
                        </span>
                        {t.contact_support_to_continue}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
