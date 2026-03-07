"use client";

import { useEffect, useState, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Terminal, Copy, Zap, AlertCircle, Loader2, Check, ShieldCheck, Activity, RefreshCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore, api } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

export default function PairPage() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const [method, setMethod] = useState<"qr" | "code">("qr");
    const [phone, setPhone] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "waiting" | "linked" | "error" | "queued">("idle");
    const [queuePosition, setQueuePosition] = useState(0);
    const [qrCode, setQrCode] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const socketRef = useRef<Socket | null>(null);

    const [sessionId, setSessionId] = useState("");
    const fetchSessions = useSessionStore(state => state.fetchSessions);
    const createPairingReq = useSessionStore(state => state.createPairingReq);
    const { token, user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (!token) return;

        // Initialize socket directly to backend
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const newSocket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token },
            reconnectionAttempts: 5,
            reconnectionDelay: 2000
        });

        socketRef.current = newSocket;

        newSocket.on("connect", () => console.log("Socket connected:", newSocket.id));
        newSocket.on("connect_error", (err) => console.error("Socket connection error:", err.message));

        newSocket.on("qr_update", (data: { qr: string; sessionId: string }) => {
            setQrCode(data.qr);
            setSessionId(data.sessionId);
            setStatus(prev => prev !== "linked" ? "waiting" : prev);
        });

        newSocket.on("pairing_code", (data: { code: string; sessionId: string }) => {
            setPairingCode(data.code);
            setSessionId(data.sessionId);
            setStatus(prev => prev !== "linked" ? "waiting" : prev);
        });

        newSocket.on("queue_update", (data: { position: number }) => {
            setStatus(prev => {
                if (prev === "waiting" || prev === "linked") return prev;
                setQueuePosition(data.position);
                return "queued";
            });
        });

        newSocket.on("queue_ready", (data: { message?: string }) => {
            setStatus(prev => {
                if (prev === "waiting" || prev === "linked") return prev;
                toast.success(data.message || (language === "sw" ? "Zamu yako! Inatengeneza muunganisho..." : "Your turn! Generating connection..."));
                return "loading";
            });
        });

        newSocket.on("pairing_success", (data: { message?: string; sessionId: string }) => {
            toast.success(data.message || (language === "sw" ? "Kifaa kimeunganishwa kwa mafanikio!" : "Device connected successfully!"));
            setStatus("linked");
            setSessionId(data.sessionId);
            fetchSessions();

            setTimeout(() => {
                router.push(`/dashboard/billing?sessionId=${data.sessionId}`);
            }, 3000);
        });

        newSocket.on("pairing_error", (err: { error?: string }) => {
            setStatus(prev => {
                if (prev === "waiting" || prev === "linked") {
                    toast.error(err.error || (language === "sw" ? "Suala la muunganisho — kodi yako inaweza bado kufanya kazi. Ingiza haraka." : "Connection issue — your code may still work. Enter it quickly."));
                    return prev;
                }
                setErrorMsg(err.error || (language === "sw" ? "Hitilafu ya Muunganisho" : "Connection Error"));
                toast.error(err.error || (language === "sw" ? "Imeshindwa kuunganisha kifaa" : "Failed to connect device"));
                return "error";
            });
        });

        return () => {
            newSocket.disconnect();
            socketRef.current = null;
        };
    }, [token, fetchSessions, router, language]);

    const handlePair = async () => {
        if (phone.startsWith("+") || phone.startsWith("0")) {
            setErrorMsg(language === "sw" ? "Umbizo batili. Tumia umbizo kamili la kimataifa bila + au sifuri ya kwanza (mf. 2557...)" : "Invalid format. Use full international format without + or leading zero (e.g. 2557...)");
            setStatus("error");
            return;
        }

        if (phone.replace(/\D/g, "").length < 10) {
            setErrorMsg(language === "sw" ? "Namba ya simu ni fupi mno. Tafadhali jumuisha kodi ya nchi (mf. 255712345678)." : "Phone number is too short. Please include country code (e.g. 255712345678).");
            setStatus("error");
            return;
        }

        setStatus("loading");
        setErrorMsg("");
        setQrCode("");
        setPairingCode("");

        const loadingTimeout = setTimeout(() => {
            setStatus(prev => {
                if (prev === "loading") {
                    setErrorMsg(language === "sw" ? "Muda wa muunganisho umeisha. Server imechukua muda mrefu mno. Tafadhali jaribu tena." : "Connection timed out. The server took too long. Please try again.");
                    return "error";
                }
                return prev;
            });
        }, 90000);

        try {
            if (socketRef.current) {
                socketRef.current.emit("start_pairing", {
                    method,
                    userId: user?._id,
                    phoneNumber: method === "code" ? phone.replace(/\D/g, "") : null
                });
            }

            const data = await createPairingReq(phone.replace(/\D/g, ""), method);
            if (data.status === "queued") {
                clearTimeout(loadingTimeout);
                setQueuePosition(data.position);
                setStatus("queued");
            } else if (data.status === "processing") {
                // Keep loading — socket events will update the status
            } else if (data.code) {
                clearTimeout(loadingTimeout);
                setPairingCode(data.code);
                setStatus("waiting");
            }
        } catch (error: any) {
            clearTimeout(loadingTimeout);
            setErrorMsg(error.message);
            setStatus("error");
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(pairingCode);
        toast.success(language === "sw" ? "Kodi imenakiliwa!" : "Code copied to clipboard");
    };

    return (
        <DashboardLayout>
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 max-w-7xl mx-auto h-full animate-fade-in">
                {/* Left: Pairing Console */}
                <div className="lg:col-span-7 space-y-6 lg:space-y-8 animate-slide-left">
                    <div className="group relative">
                        {/* Glowing Border Effect */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/0 rounded-3xl blur opacity-20 transition duration-1000"></div>

                        <div className="relative p-4 sm:p-6 lg:p-8 rounded-3xl border border-border bg-card/50 backdrop-blur-2xl shadow-xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-8">
                                <div className="space-y-1">
                                    <h2 className="text-base sm:text-lg lg:text-xl font-semibold tracking-tight text-white flex items-center gap-3">
                                        <Terminal className="h-5 w-5 text-primary" />
                                        {t.connect_your_device}
                                    </h2>
                                    <p className="text-[9px] sm:text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                                        {t.link_whatsapp}
                                    </p>
                                </div>
                                <div className="flex gap-1.5 opacity-30">
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                </div>
                            </div>

                            {/* Action Toggle */}
                            <div className="inline-flex p-1 bg-white/5 rounded-xl mb-8 border border-white/10">
                                <button
                                    onClick={() => setMethod("qr")}
                                    className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'qr' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    disabled={status === "loading" || status === "waiting"}
                                >
                                    {t.qr_code}
                                </button>
                                <button
                                    onClick={() => setMethod("code")}
                                    className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'code' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    disabled={status === "loading" || status === "waiting"}
                                >
                                    {t.pairing_code}
                                </button>
                            </div>

                            {/* Dynamic Content Area */}
                            <div>
                                {status === "idle" && (
                                    <div className="space-y-6 animate-fade-in">
                                        <div className="space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                                    {t.phone_number}
                                                </label>
                                                <span className="text-[10px] font-bold text-primary/70 uppercase">Format: 255...</span>
                                            </div>
                                            <div className="relative group/input">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within/input:text-primary transition-colors">
                                                    <Plus className="h-4 w-4" />
                                                </div>
                                                <input
                                                    type="tel"
                                                    placeholder="2557..."
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    className="w-full h-14 pl-11 bg-white/5 border border-white/10 hover:border-white/20 focus:border-primary/50 text-base font-semibold tracking-tight text-white placeholder:text-gray-700 transition-all rounded-xl outline-none focus:ring-1 focus:ring-primary/50"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-600 font-medium uppercase tracking-wider ml-1">
                                                {language === "sw" ? "* Usiongeze sifuri ya mwanzo. Jumuisha kodi ya nchi." : "* Omit leading zero. Include country prefix."}
                                            </p>
                                        </div>

                                        <Button
                                            onClick={handlePair}
                                            className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group mt-4 hover:scale-[1.01]"
                                        >
                                            {method === "qr" ? t.generate_qr : t.get_pairing_code}
                                            <Zap className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </div>
                                )}

                                {status === "loading" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-primary animate-fade-in py-12">
                                        <Loader2 className="h-12 w-12 animate-spin" />
                                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse">
                                            {t.preparing_connection}
                                        </p>
                                    </div>
                                )}

                                {status === "queued" && (
                                    <div className="flex flex-col items-center justify-center text-center gap-6 text-amber-500 animate-fade-in py-12">
                                        <div className="relative flex items-center justify-center w-24 h-24">
                                            <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full animate-ping"></div>
                                            <div className="absolute inset-2 border-4 border-amber-500/40 rounded-full animate-ping" style={{ animationDelay: "0.2s" }}></div>
                                            <div className="z-10 flex flex-col items-center justify-center bg-card shadow-2xl rounded-full w-20 h-20 border-2 border-amber-500 shadow-amber-500/50">
                                                <span className="text-2xl font-black text-amber-500">#{queuePosition}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-amber-500 font-mono">
                                                {t.server_busy}
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 max-w-xs mx-auto">
                                                {t.queue_desc}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            onClick={async () => {
                                                setStatus("idle");
                                                try { await api.delete("/sessions/pair/queue"); } catch (e) { }
                                            }}
                                            className="mt-4 h-10 w-32 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 font-bold text-[9px] tracking-widest uppercase transition-all"
                                        >
                                            {t.cancel}
                                        </Button>
                                    </div>
                                )}

                                {status === "waiting" && (
                                    <div className="space-y-8 py-4 animate-fade-in">
                                        <div className="flex flex-col items-center text-center space-y-4">
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-bold tracking-tight text-primary flex items-center justify-center gap-2">
                                                    <span className="animate-pulse">{t.waiting_connection}</span>
                                                </h3>
                                            </div>
                                        </div>

                                        <div className="flex justify-center min-h-[200px] items-center">
                                            <div className="bg-white p-4 rounded-xl shadow-2xl transition-all">
                                                {method === "qr" ? (
                                                    qrCode ? (
                                                        <QRCodeSVG value={qrCode} size={250} />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center gap-3 w-[250px] h-[250px] bg-gray-100/50 rounded-lg text-gray-400">
                                                            <Loader2 className="h-6 w-6 animate-spin" />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">Awaiting Payload...</span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="flex gap-2 min-h-[56px] items-center justify-center p-2">
                                                        {pairingCode ? pairingCode.split('').map((char, i) => (
                                                            <div key={i} className={`w-10 h-14 ${char === '-' ? 'bg-transparent text-gray-400 border-none' : 'bg-gray-100 border-2 border-transparent text-black shadow-sm'} rounded-lg flex items-center justify-center text-2xl font-black`}>
                                                                {char}
                                                            </div>
                                                        )) : (
                                                            <div className="flex flex-col items-center justify-center gap-3 text-gray-400 px-4">
                                                                <Loader2 className="h-6 w-6 animate-spin" />
                                                                <span className="text-[10px] font-bold uppercase tracking-widest">Awaiting Code...</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {method === "code" && pairingCode && (
                                            <div className="flex flex-wrap justify-center gap-4">
                                                <div className="flex gap-2">
                                                    <Button variant="outline" onClick={handleCopy} className="h-8 px-4 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                                                        <Copy className="h-3 w-3 mr-2" /> {language === "sw" ? "Nakili" : "Copy"}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                            <Button
                                                variant="ghost"
                                                onClick={() => { setStatus("idle"); setQrCode(""); setPairingCode(""); }}
                                                className="flex-1 h-12 rounded-xl text-white hover:bg-white/10 bg-white/5 border border-white/10 font-bold text-xs tracking-widest uppercase transition-all"
                                            >
                                                {t.cancel}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {status === "linked" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-primary animate-fade-in py-12">
                                        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                            <Check className="h-8 w-8" />
                                        </div>
                                        <p className="text-[12px] font-bold uppercase tracking-[0.3em]">
                                            {t.device_connected}
                                        </p>
                                    </div>
                                )}

                                {status === "error" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-destructive animate-fade-in py-12">
                                        <AlertCircle className="h-12 w-12" />
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center max-w-sm">
                                            {errorMsg}
                                        </p>
                                        <Button variant="outline" onClick={() => setStatus("idle")} className="mt-4 border-white/10 text-white hover:bg-white/10 uppercase tracking-widest text-[10px]">
                                            {language === "sw" ? "Jaribu Tena" : "Try Again"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Signal Stats Display */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default">
                            <Activity className="h-3.5 w-3.5 text-gray-500" />
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600">{t.latency}</p>
                            <p className="text-[10px] font-semibold text-white tracking-widest">14ms</p>
                        </div>
                        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default">
                            <ShieldCheck className="h-3.5 w-3.5 text-gray-500" />
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600">{t.encryption}</p>
                            <p className="text-[10px] font-semibold text-white tracking-widest">{t.encryption_aes}</p>
                        </div>
                        <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default">
                            <RefreshCcw className="h-3.5 w-3.5 text-gray-500" />
                            <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600">{t.uptime}</p>
                            <p className="text-[10px] font-semibold text-white tracking-widest">{t.uptime_stats}</p>
                        </div>
                    </div>
                </div>

                {/* Right: Disclaimer/Features */}
                <div className="lg:col-span-5 space-y-6 animate-slide-right hidden lg:block">
                    <div className="p-8 rounded-3xl border border-border bg-card/50 backdrop-blur-md h-full">
                        <div className="space-y-1 mb-8">
                            <h2 className="text-lg font-semibold text-white tracking-tight uppercase">{t.usage_terms_safety}</h2>
                            <p className="text-[10px] font-semibold text-amber-500 tracking-widest uppercase">{t.risk_disclaimer}</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-3 p-6 rounded-2xl bg-white/5 border border-white/10 text-amber-500">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.account_responsibility}</span>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    {t.account_responsibility_desc.split('not our responsibility')[0]}
                                    <span className="text-white font-bold">{language === "sw" ? "si jukumu letu" : "not our responsibility"}</span>
                                    {t.account_responsibility_desc.split('not our responsibility')[1] || t.account_responsibility_desc.split('si jukumu letu')[1]}
                                </p>
                            </div>

                            <div className="space-y-3 p-6 rounded-2xl bg-primary/5 border border-primary/10">
                                <div className="flex items-center gap-2 text-primary">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.data_protection_risk}</span>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    {t.data_protection_risk_desc.split('not 100% free')[0].split('si bure 100%')[0]}
                                    <span className="text-white font-bold">{language === "sw" ? "si bure 100%" : "not 100% free"}</span>
                                    {t.data_protection_risk_desc.split('not 100% free')[1] || t.data_protection_risk_desc.split('si bure 100%')[1]}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout >
    );
}
