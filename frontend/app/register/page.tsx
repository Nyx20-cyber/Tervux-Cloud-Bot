"use client";

import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { motion } from "framer-motion";
import { io } from "socket.io-client";

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [referralCode, setReferralCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
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
                setRegistrationEnabled(false);
            } finally {
                setConfigLoading(false);
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

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await api.post("/auth/register", { name, email, password, referralCode });
            login(res.data.token, res.data.user);
            toast.success(language === "sw" ? "Akaunti imetengenezwa!" : "Account created successfully!");
            router.push("/dashboard");
        } catch (error: any) {
            toast.error(error.response?.data?.error || (language === "sw" ? "Usajili umeshindwa" : "Registration failed"));
        } finally {
            setIsLoading(false);
        }
    };

    if (configLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (!registrationEnabled) {
        return (
            <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 bg-black">
                <div className="w-full max-w-xl rounded-3xl border border-orange-500/20 bg-white/[0.03] p-8 space-y-5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-300">
                            {t.registration_closed_title}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-wide">
                        {t.registration_closed_title}
                    </h1>
                    <p className="text-sm text-gray-300 leading-relaxed">
                        {t.registration_closed_message}
                    </p>
                    <p className="text-xs text-gray-400">
                        {t.registration_closed_retry}
                    </p>
                    <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest">
                        {t.sign_in}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-3 pt-18 sm:p-4 sm:pt-4 animate-fade-in relative z-20 overflow-hidden bg-black">
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

            <div className="w-full max-w-sm sm:max-w-md p-4 sm:p-10 rounded-[1.35rem] sm:rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary/10 to-transparent rounded-[1.35rem] sm:rounded-[2.5rem] blur opacity-20 z-0 transition-opacity duration-500"></div>
                <div className="relative z-10 space-y-4 sm:space-y-8">
                    <div className="text-center space-y-3 sm:space-y-6">
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
                                className="p-3 sm:p-5 rounded-2xl sm:rounded-[1.75rem] bg-primary/5 border border-primary/10 shadow-inner"
                            >
                                <ShieldCheck className="h-6 w-6 sm:h-10 sm:w-10 text-primary/80" />
                            </motion.div>
                        </div>
                        <div className="space-y-1.5">
                            <h1 className="text-lg sm:text-2xl font-bold text-white uppercase tracking-[0.16em] sm:tracking-[0.25em] font-mono">{t.app_name}</h1>
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-[0.3em] opacity-80">{t.create_account}</p>
                        </div>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-3.5">
                        <div className="space-y-2 sm:space-y-3">
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-2 opacity-60">{t.full_name}</label>
                                <Input
                                    placeholder="John Doe"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="h-11 sm:h-14 bg-white/[0.03] border-white/5 text-white placeholder:text-gray-700 focus-visible:ring-primary/40 focus-visible:border-primary/30 text-sm font-medium tracking-wide rounded-xl sm:rounded-2xl transition-all px-4 sm:px-6 outline-none shadow-inner"
                                    required
                                />
                            </div>
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
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-2 opacity-60">{t.referral_code_optional}</label>
                                <Input
                                    placeholder="INVITE123"
                                    value={referralCode}
                                    onChange={e => setReferralCode(e.target.value)}
                                    className="h-11 sm:h-14 bg-white/[0.03] border-white/5 text-white placeholder:text-gray-700 focus-visible:ring-primary/40 focus-visible:border-primary/30 text-sm font-medium tracking-wide rounded-xl sm:rounded-2xl transition-all px-4 sm:px-6 outline-none shadow-inner border-dashed"
                                />
                            </div>
                        </div>

                        <Button type="submit" disabled={isLoading} className="w-full h-11 sm:h-14 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[10px] sm:text-[11px] rounded-xl sm:rounded-2xl shadow-xl shadow-primary/10 mt-4 active:scale-98 transition-all">
                            {isLoading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> {t.getting_started_loading}</> : t.get_started}
                        </Button>
                    </form>

                    <div className="text-center pt-5 sm:pt-6 border-t border-white/[0.05]">
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                            {t.already_have_account} <Link href="/login" className="text-primary hover:text-primary/80 transition-colors ml-1.5 font-bold">{t.sign_in}</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
