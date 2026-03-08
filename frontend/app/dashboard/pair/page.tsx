"use client";

import { useEffect, useState, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Terminal, Copy, Zap, AlertCircle, Loader2, Check, ShieldCheck, Activity, RefreshCcw, Plus, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
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
    const socketWarningShownRef = useRef(false);
    const statusWatchdogRef = useRef<NodeJS.Timeout | null>(null);
    const idleStateHitsRef = useRef(0);
    const successHandledRef = useRef(false);

    const [sessionId, setSessionId] = useState("");
    const fetchSessions = useSessionStore(state => state.fetchSessions);
    const createPairingReq = useSessionStore(state => state.createPairingReq);
    const { token } = useAuthStore();
    const router = useRouter();

    const triggerPairingSuccess = (sid: string, msg?: string) => {
        if (!sid || successHandledRef.current) return;
        successHandledRef.current = true;
        toast.success(msg || t.pair_success);
        setStatus("linked");
        setSessionId(sid);
        fetchSessions();
        confetti({
            particleCount: 160,
            spread: 90,
            startVelocity: 42,
            origin: { y: 0.6 }
        });
        setTimeout(() => {
            confetti({
                particleCount: 90,
                spread: 72,
                startVelocity: 36,
                origin: { y: 0.7, x: 0.3 }
            });
            confetti({
                particleCount: 90,
                spread: 72,
                startVelocity: 36,
                origin: { y: 0.7, x: 0.7 }
            });
        }, 240);
        setTimeout(() => {
            toast.message(t.pair_redirect_deployments);
            router.push(`/dashboard/deployments?sessionId=${sid}`);
        }, 3000);
    };

    useEffect(() => {
        if (!token) return;

        // Build socket base URL robustly:
        // - prefer NEXT_PUBLIC_SOCKET_URL
        // - else derive from NEXT_PUBLIC_API_URL by removing trailing /api
        // - else fallback to same-origin (Next proxy)
        const rawSocketUrl = (process.env.NEXT_PUBLIC_SOCKET_URL || "").trim();
        const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();
        const derivedApiOrigin = rawApiUrl.replace(/\/api\/?$/, "");
        const backendUrl = rawSocketUrl || derivedApiOrigin || "";

        const newSocket = io(backendUrl, {
            transports: ["polling", "websocket"],
            path: "/socket.io",
            auth: { token },
            reconnectionAttempts: 5,
            reconnectionDelay: 2000
        });

        socketRef.current = newSocket;

        newSocket.on("connect", () => {
            socketWarningShownRef.current = false;
            console.log("Socket connected:", newSocket.id);
        });
        newSocket.on("connect_error", (err) => {
            // Keep a single concise warning and avoid endless loading state on hard failures.
            if (!socketWarningShownRef.current) {
                console.warn("Pair socket connect error:", err?.message || "unknown");
            }
        });
        newSocket.io.on("reconnect_failed", () => {
            if (socketWarningShownRef.current) return;
            socketWarningShownRef.current = true;
            console.warn("Realtime socket connection failed after retries.");
            toast.warning("Realtime connection issue. Trying fallback delivery...");
        });

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
            if (!data?.position || data.position <= 0) return;
            setStatus(prev => {
                if (prev === "waiting" || prev === "linked") return prev;
                setQueuePosition(data.position);
                return "queued";
            });
        });
        newSocket.on("pairing_retry", (data: { message?: string; attempt?: number; maxAttempts?: number }) => {
            setStatus(prev => (prev === "linked" ? prev : "loading"));
            if (data?.message) {
                toast.message(
                    data.attempt && data.maxAttempts
                        ? `${data.message} (${data.attempt}/${data.maxAttempts})`
                        : data.message
                );
            }
        });

        newSocket.on("queue_ready", (data: { message?: string }) => {
            setStatus(prev => {
                if (prev === "queued") {
                    toast.success(data.message || t.pair_queue_ready);
                    return "loading";
                }
                if (prev === "waiting" || prev === "linked") return prev;
                return prev === "loading" ? prev : "loading";
            });
        });

        newSocket.on("pairing_success", (data: { message?: string; sessionId: string }) => {
            triggerPairingSuccess(data.sessionId, data.message || t.pair_success);
        });

        newSocket.on("pairing_error", (err: { error?: string }) => {
            setStatus(prev => {
                if (prev === "waiting" || prev === "linked") {
                    toast.error(err.error || t.pair_connection_issue);
                    return prev;
                }
                setErrorMsg(err.error || t.pair_connection_error);
                toast.error(err.error || t.pair_connect_failed);
                return "error";
            });
        });

        return () => {
            if (statusWatchdogRef.current) {
                clearTimeout(statusWatchdogRef.current);
                statusWatchdogRef.current = null;
            }
            newSocket.disconnect();
            socketRef.current = null;
        };
    }, [token, fetchSessions, router, t]);

    useEffect(() => {
        if (!sessionId) return;
        if (!["loading", "waiting"].includes(status)) return;
        if (successHandledRef.current) return;

        let active = true;
        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get(`/sessions/${sessionId}/status`);
                const s = String(res?.data?.status || "").toLowerCase();
                if (s === "active") {
                    triggerPairingSuccess(sessionId, t.pair_success);
                }
            } catch {
                // keep polling silently while pairing is in progress
            }
        }, 4000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [sessionId, status, t]);

    useEffect(() => {
        if (!["loading", "waiting"].includes(status)) return;
        if (successHandledRef.current) return;

        const normalizedPhone = phone.replace(/\D/g, "");
        if (!normalizedPhone) return;

        let active = true;
        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get("/sessions");
                const sessions: Array<{ _id: string; status?: string; phone?: string }> = res?.data?.sessions || [];
                const matched = sessions.find((s) => {
                    const p = String(s?.phone || "").replace(/\D/g, "");
                    return p === normalizedPhone || p.endsWith(normalizedPhone);
                });
                if (matched && String(matched.status || "").toLowerCase() === "active") {
                    triggerPairingSuccess(matched._id, t.pair_success);
                }
            } catch {
                // silent fallback
            }
        }, 5000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [status, phone, t]);

    useEffect(() => {
        if (statusWatchdogRef.current) {
            clearTimeout(statusWatchdogRef.current);
            statusWatchdogRef.current = null;
        }
        if (!["loading", "queued", "waiting"].includes(status)) return;

        statusWatchdogRef.current = setTimeout(() => {
            setStatus((prev) => {
                if (!["loading", "queued", "waiting"].includes(prev)) return prev;
                setErrorMsg(t.pair_timeout);
                toast.error(t.pair_timeout);
                return "error";
            });
        }, 210000);

        return () => {
            if (statusWatchdogRef.current) {
                clearTimeout(statusWatchdogRef.current);
                statusWatchdogRef.current = null;
            }
        };
    }, [status, t]);

    useEffect(() => {
        if (method !== "code") return;
        if (!["loading", "waiting"].includes(status)) return;
        if (pairingCode) return;

        let active = true;
        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get("/sessions/pair/latest-code");
                const code = res?.data?.code;
                if (typeof code === "string" && code.trim()) {
                    setPairingCode(code);
                    if (res?.data?.sessionId) setSessionId(res.data.sessionId);
                    setStatus((prev) => (prev === "linked" ? prev : "waiting"));
                }
            } catch {
                // keep polling until socket success/error or watchdog timeout
            }
        }, 2500);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [method, status, pairingCode]);

    useEffect(() => {
        if (method !== "qr") return;
        if (!["loading", "waiting"].includes(status)) return;
        if (qrCode) return;

        let active = true;
        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get("/sessions/pair/latest-qr");
                const qr = res?.data?.qr;
                if (typeof qr === "string" && qr.trim()) {
                    setQrCode(qr);
                    if (res?.data?.sessionId) setSessionId(res.data.sessionId);
                    setStatus((prev) => (prev === "linked" ? prev : "waiting"));
                }
            } catch {
                // keep polling until socket success/error or watchdog timeout
            }
        }, 2500);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [method, status, qrCode]);

    useEffect(() => {
        if (!["queued", "loading"].includes(status)) return;
        let active = true;

        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get("/sessions/pair/queue-status");
                const position = Number(res?.data?.position);
                if (!Number.isFinite(position)) return;

                // 0 means pairing is currently processing for this user.
                if (position === 0) {
                    setStatus((prev) => (prev === "linked" || prev === "waiting" ? prev : "loading"));
                    return;
                }
                // >0 means still queued.
                if (position > 0) {
                    setQueuePosition(position);
                    setStatus((prev) => (prev === "linked" || prev === "waiting" ? prev : "queued"));
                }
            } catch {
                // Silent fallback; realtime socket or watchdog still handles terminal states.
            }
        }, 3000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [status]);

    useEffect(() => {
        if (!["loading", "waiting", "queued"].includes(status)) {
            idleStateHitsRef.current = 0;
            return;
        }

        let active = true;
        const interval = setInterval(async () => {
            if (!active) return;
            try {
                const res = await api.get("/sessions/pair/state");
                const state = String(res?.data?.state || "");
                const hasCode = !!res?.data?.hasCode;
                const hasQr = !!res?.data?.hasQr;
                if (state === "processing") {
                    idleStateHitsRef.current = 0;
                    return;
                }
                if (state === "queued") {
                    idleStateHitsRef.current = 0;
                    const position = Number(res?.data?.position);
                    if (Number.isFinite(position) && position > 0) {
                        setQueuePosition(position);
                    }
                    return;
                }
                if (state === "idle" && !hasCode && !hasQr) {
                    idleStateHitsRef.current += 1;
                    if (idleStateHitsRef.current >= 2) {
                        setStatus((prev) => {
                            if (!["loading", "waiting", "queued"].includes(prev)) return prev;
                            setErrorMsg(t.pair_connect_failed);
                            toast.error(t.pair_connect_failed);
                            return "error";
                        });
                    }
                }
            } catch {
                // keep silent; other fallbacks/watchdog handle it.
            }
        }, 4000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [status, t]);

    const handlePair = async () => {
        successHandledRef.current = false;
        if (phone.startsWith("+") || phone.startsWith("0")) {
            setErrorMsg(t.pair_invalid_format);
            setStatus("error");
            return;
        }

        if (phone.replace(/\D/g, "").length < 10) {
            setErrorMsg(t.pair_phone_too_short);
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
                    setErrorMsg(t.pair_timeout);
                    return "error";
                }
                return prev;
            });
        }, 180000);

        try {
            const data = await createPairingReq(phone.replace(/\D/g, ""), method, socketRef.current?.id || undefined);
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

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(pairingCode);
            toast.success(t.pair_code_copied);
        } catch {
            toast.error("Failed to copy code. Please copy manually.");
        }
    };

    const handleShareCode = async () => {
        if (!pairingCode) return;
        const text = `My TERVUX pairing code: ${pairingCode}`;
        try {
            if (typeof navigator !== "undefined" && navigator.share) {
                await navigator.share({
                    title: "TERVUX Pairing Code",
                    text
                });
                return;
            }
            await navigator.clipboard.writeText(text);
            toast.success("Pairing code copied for sharing.");
        } catch {
            toast.error("Unable to share right now. Please copy the code.");
        }
    };

    const cancelCurrentPairing = async () => {
        try {
            await api.delete("/sessions/pair/queue");
        } catch {
            // best effort cancellation
        } finally {
            setQrCode("");
            setPairingCode("");
            setSessionId("");
            setQueuePosition(0);
            setStatus("idle");
        }
    };

    return (
        <DashboardLayout>
            <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 max-w-7xl mx-auto h-full animate-fade-in">
                {/* Left: Pairing Console */}
                <div className="lg:col-span-7 space-y-6 lg:space-y-8 animate-slide-left">
                    <div className="group relative">
                        {/* Glowing Border Effect */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/0 rounded-3xl blur opacity-20 transition duration-1000"></div>

                        <div className="relative p-3 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl border border-border bg-card/50 backdrop-blur-2xl shadow-xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-5 sm:mb-8">
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
                            <div className="inline-flex p-1 bg-white/5 rounded-xl mb-5 sm:mb-8 border border-white/10 w-full sm:w-auto">
                                <button
                                    onClick={() => setMethod("qr")}
                                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'qr' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    disabled={status === "loading" || status === "waiting"}
                                >
                                    {t.qr_code}
                                </button>
                                <button
                                    onClick={() => setMethod("code")}
                                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'code' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
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
                                                    className="w-full h-12 sm:h-14 pl-11 bg-white/5 border border-white/10 hover:border-white/20 focus:border-primary/50 text-sm sm:text-base font-semibold tracking-tight text-white placeholder:text-gray-700 transition-all rounded-xl outline-none focus:ring-1 focus:ring-primary/50"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-600 font-medium uppercase tracking-wider ml-1">
                                                {t.pair_phone_hint}
                                            </p>
                                        </div>

                                        <Button
                                            onClick={handlePair}
                                            className="w-full h-12 sm:h-14 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-widest text-[10px] sm:text-[11px] shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group mt-4 hover:scale-[1.01]"
                                        >
                                            {method === "qr" ? t.generate_qr : t.get_pairing_code}
                                            <Zap className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </div>
                                )}

                                {status === "loading" && (
                                    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 to-transparent px-6 py-12 flex flex-col items-center justify-center gap-4 text-primary animate-fade-in">
                                        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)]"></div>
                                        <div className="relative flex items-center justify-center w-16 h-16 rounded-full border border-primary/40 bg-primary/10">
                                            <Loader2 className="h-8 w-8 animate-spin" />
                                        </div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse text-center">
                                            {t.preparing_connection}
                                        </p>
                                        <p className="text-[10px] text-primary/70 text-center">Securing encrypted channel to WhatsApp...</p>
                                        <Button
                                            variant="ghost"
                                            onClick={cancelCurrentPairing}
                                            className="mt-2 h-8 px-4 rounded-full text-[10px] uppercase tracking-widest border border-white/10 text-white/80 hover:text-white hover:bg-white/10"
                                        >
                                            {t.cancel}
                                        </Button>
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
                                            onClick={cancelCurrentPairing}
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
                                            <div className="border border-white/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-black/20 transition-all">
                                                {method === "qr" ? (
                                                    qrCode ? (
                                                        <div className="bg-white p-2 sm:p-3 rounded-xl shadow-none">
                                                            <QRCodeSVG
                                                                value={qrCode}
                                                                size={220}
                                                                includeMargin
                                                                bgColor="#FFFFFF"
                                                                fgColor="#111111"
                                                                level="M"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center gap-3 w-[220px] h-[220px] bg-gray-100/80 rounded-lg text-gray-500">
                                                            <Loader2 className="h-6 w-6 animate-spin" />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">{t.pair_awaiting_payload}</span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="w-full min-h-[56px] flex flex-col items-center justify-center gap-3 sm:gap-4 p-3 sm:p-4">
                                                            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center justify-center max-w-full">
                                                                {pairingCode ? pairingCode.split('').map((char, i) => (
                                                                <div key={i} className={`w-7 sm:w-10 h-10 sm:h-14 ${char === '-' ? 'bg-transparent text-gray-500 border-none' : 'bg-black/50 border border-primary/30 text-primary'} rounded-md sm:rounded-lg flex items-center justify-center text-lg sm:text-2xl font-black backdrop-blur-sm`}>
                                                                    {char}
                                                                </div>
                                                            )) : (
                                                                <div className="flex flex-col items-center justify-center gap-3 text-gray-400 px-4">
                                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.pair_awaiting_code}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {pairingCode && (
                                                        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider text-primary">
                                                            <Sparkles className="h-3 w-3" />
                                                            Secure one-time pairing token
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
                                                        <Copy className="h-3 w-3 mr-2" /> {t.copy_code}
                                                    </Button>
                                                    <Button variant="outline" onClick={handleShareCode} className="h-8 px-4 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                                                        <Share2 className="h-3 w-3 mr-2" /> Share
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                            <Button
                                                variant="ghost"
                                                onClick={cancelCurrentPairing}
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
                                            {t.try_again}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Signal Stats Display */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-6">
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
                <div className="lg:col-span-5 space-y-4 sm:space-y-6 animate-slide-right">
                    <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-border bg-card/50 backdrop-blur-md h-full">
                        <div className="space-y-1 mb-8">
                            <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight uppercase">{t.usage_terms_safety}</h2>
                            <p className="text-[10px] font-semibold text-amber-500 tracking-widest uppercase">{t.risk_disclaimer}</p>
                        </div>

                        <div className="space-y-4 sm:space-y-6">
                            <div className="space-y-2.5 sm:space-y-3 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 text-amber-500">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.account_responsibility}</span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-gray-400 leading-relaxed font-medium">{t.account_responsibility_desc}</p>
                            </div>

                            <div className="space-y-2.5 sm:space-y-3 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-primary/5 border border-primary/10">
                                <div className="flex items-center gap-2 text-primary">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.data_protection_risk}</span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-gray-400 leading-relaxed font-medium">{t.data_protection_risk_desc}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout >
    );
}
