"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Terminal, Copy, Share2, Zap, AlertCircle, Loader2, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore, api } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";

export default function PairPage() {
    const [method, setMethod] = useState<"qr" | "code">("qr");
    const [phone, setPhone] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "waiting" | "linked" | "error" | "queued">("idle");
    const [queuePosition, setQueuePosition] = useState(0);
    const [qrCode, setQrCode] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [socket, setSocket] = useState<Socket | null>(null);

    const [sessionId, setSessionId] = useState("");
    const { createPairingReq, fetchSessions } = useSessionStore();
    const { token } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (!token) return;

        // Initialize socket directly to backend (bypass Next.js proxy which drops WS headers)
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
        const newSocket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        setSocket(newSocket);

        newSocket.on("connect", () => console.log("Socket connected:", newSocket.id));

        newSocket.on("qr_update", (data: any) => {
            setQrCode(data.qr);
            setSessionId(data.sessionId);
            setStatus(prev => prev !== "linked" ? "waiting" : prev);
        });

        newSocket.on("pairing_code", (data: any) => {
            setPairingCode(data.code);
            setSessionId(data.sessionId);
            setStatus(prev => prev !== "linked" ? "waiting" : prev);
        });

        newSocket.on("queue_update", (data: any) => {
            setQueuePosition(data.position);
            setStatus("queued");
        });

        newSocket.on("queue_ready", (data: any) => {
            setStatus("loading");
            toast.success(data.message || "Your turn! Generating connection...");
        });

        // Backend event names
        newSocket.on("pairing_success", (data: any) => {
            toast.success(data.message || "Device connected successfully!");
            setStatus("linked");
            setSessionId(data.sessionId);
            fetchSessions();

            // Wait a moment and then push to the checkout UI with the new sessionId
            setTimeout(() => {
                router.push(`/dashboard/billing?sessionId=${data.sessionId}`);
            }, 3000);
        });

        newSocket.on("pairing_error", (err: any) => {
            setErrorMsg(err.error || "Connection Error");
            setStatus("error");
            toast.error(err.error || "Failed to connect device");
            setTimeout(() => setStatus("idle"), 5000);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [token, fetchSessions, router]);

    const handlePair = async () => {
        if (phone.startsWith("+") || phone.startsWith("0")) {
            setErrorMsg("Invalid module ID. Use full international format without + or leading zero (e.g. 2557...)");
            setStatus("error");
            return;
        }

        setStatus("loading");
        setErrorMsg("");

        try {
            const data = await createPairingReq(phone.replace(/\D/g, ""), method);
            if (data.status === "queued") {
                setQueuePosition(data.position);
                setStatus("queued");
            } else if (data.status === "processing") {
                setStatus("loading");
            } else if (data.code) {
                setPairingCode(data.code);
                setStatus("waiting");
            }
        } catch (error: any) {
            setErrorMsg(error.message);
            setStatus("error");
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(pairingCode);
        toast.success("Code copied to clipboard");
    };

    return (
        <DashboardLayout>
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 max-w-7xl mx-auto h-full animate-fade-in">
                {/* Left: Pairing Console */}
                <div className="lg:col-span-7 space-y-6 lg:space-y-8 animate-slide-left">
                    <div className="group relative">
                        {/* Glowing Border Effect */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/0 rounded-3xl blur opacity-20 transition duration-1000"></div>

                        <div className="relative p-6 lg:p-8 rounded-3xl border border-border bg-card/50 backdrop-blur-2xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-8">
                                <div className="space-y-1">
                                    <h2 className="text-base sm:text-lg lg:text-xl font-semibold tracking-tight text-white flex items-center gap-3">
                                        <Terminal className="h-5 w-5 text-primary" />
                                        Connect Your Device
                                    </h2>
                                    <p className="text-[9px] sm:text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                                        Link your WhatsApp account
                                    </p>
                                </div>
                                <div className="flex gap-1.5 opacity-30">
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                                </div>
                            </div>

                            {/* Action Toggle */}
                            <div className="inline-flex p-1 bg-white/5 rounded-xl mb-8 border border-white/10 w-fit">
                                <button
                                    onClick={() => setMethod("qr")}
                                    className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'qr' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    disabled={status === "loading" || status === "waiting"}
                                >
                                    QR Code
                                </button>
                                <button
                                    onClick={() => setMethod("code")}
                                    className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${method === 'code' ? 'bg-primary text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    disabled={status === "loading" || status === "waiting"}
                                >
                                    Pairing Code
                                </button>
                            </div>

                            {/* Dynamic Content Area */}
                            <div className="flex-1 flex flex-col justify-center gap-6">
                                {status === "idle" && (
                                    <div className="space-y-6 animate-fade-in flex-1">
                                        <div className="space-y-4">
                                            <div className="flex justify-between px-1">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                                    Phone Number
                                                </label>
                                                <span className="text-[10px] font-bold text-primary/70 uppercase">Format: 255...</span>
                                            </div>
                                            <Input
                                                type="tel"
                                                placeholder="e.g. 255712345678"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="h-14 bg-white/5 border-white/10 hover:border-white/20 focus-visible:ring-primary/50 text-base font-semibold text-white placeholder:text-gray-700 rounded-xl"
                                            />
                                            <p className="text-[9px] text-gray-600 font-medium uppercase tracking-wider ml-1">
                                                * Omit leading zero. Include country prefix for global signal lock.
                                            </p>
                                        </div>

                                        <Button
                                            onClick={handlePair}
                                            className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group mt-4 hover:scale-[1.01]"
                                        >
                                            {method === "qr" ? "Generate QR Code" : "Get Pairing Code"}
                                            <Zap className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </div>
                                )}

                                {status === "loading" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-primary animate-fade-in py-12 flex-1">
                                        <Loader2 className="h-12 w-12 animate-spin" />
                                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse">
                                            Preparing connection...
                                        </p>
                                    </div>
                                )}

                                {status === "queued" && (
                                    <div className="flex flex-col items-center justify-center text-center gap-6 text-amber-500 animate-fade-in py-12 flex-1">
                                        <div className="relative flex items-center justify-center w-24 h-24">
                                            <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full animate-ping"></div>
                                            <div className="absolute inset-2 border-4 border-amber-500/40 rounded-full animate-ping" style={{ animationDelay: "0.2s" }}></div>
                                            <div className="z-10 flex flex-col items-center justify-center bg-card shadow-2xl rounded-full w-20 h-20 border-2 border-amber-500 shadow-amber-500/50">
                                                <span className="text-2xl font-black text-amber-500">#{queuePosition}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-amber-500 font-mono">
                                                Server is busy
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 max-w-xs mx-auto">
                                                Too many people are linking right now. You have to wait for your turn. Don't leave or close the window!
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
                                            Cancel
                                        </Button>
                                    </div>
                                )}

                                {status === "waiting" && (
                                    <div className="flex flex-col items-center text-center space-y-8 animate-fade-in flex-1">
                                        <div className="space-y-2">
                                            <h3 className="text-xl font-bold tracking-tight text-primary flex items-center justify-center gap-2">
                                                <span className="animate-pulse">Waiting for connection...</span>
                                            </h3>
                                        </div>

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

                                        {method === "code" && pairingCode && (
                                            <div className="flex gap-4">
                                                <Button variant="outline" onClick={handleCopy} className="rounded-full border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary text-[10px] font-black uppercase tracking-widest h-10 px-6">
                                                    <Copy className="h-4 w-4 mr-2" /> Copy
                                                </Button>
                                            </div>
                                        )}

                                        <Button
                                            variant="ghost"
                                            onClick={() => { setStatus("idle"); setQrCode(""); setPairingCode(""); }}
                                            className="w-full h-12 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 font-bold text-xs tracking-widest uppercase transition-all"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                )}

                                {status === "linked" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-primary animate-fade-in py-12 flex-1">
                                        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                            <Check className="h-8 w-8" />
                                        </div>
                                        <p className="text-[12px] font-bold uppercase tracking-[0.3em]">
                                            Device Connected
                                        </p>
                                    </div>
                                )}

                                {status === "error" && (
                                    <div className="flex flex-col items-center justify-center gap-4 text-destructive animate-fade-in py-12 flex-1">
                                        <AlertCircle className="h-12 w-12" />
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center max-w-sm">
                                            {errorMsg}
                                        </p>
                                        <Button variant="outline" onClick={() => setStatus("idle")} className="mt-4 border-white/10 text-white hover:bg-white/10 uppercase tracking-widest text-[10px]">
                                            Try Again
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Disclaimer/Features */}
                <div className="lg:col-span-5 space-y-6 animate-slide-right hidden lg:block">
                    <div className="p-8 rounded-3xl border border-border bg-card/50 backdrop-blur-md h-full">
                        <div className="space-y-1 mb-8">
                            <h2 className="text-lg font-semibold text-white tracking-tight uppercase">Usage Terms & Safety</h2>
                            <p className="text-[10px] font-semibold text-amber-500 tracking-widest uppercase">Risk Disclaimer</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-3 p-6 rounded-2xl bg-white/5 border border-white/10 text-amber-500">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Account Responsibility</span>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    Any usage issues or bans affecting your WhatsApp number <span className="text-white font-bold">are not our responsibility</span>.
                                    You are solely responsible for how you use the bot, and any action taken by WhatsApp against your account is your own liability.
                                </p>
                            </div>

                            <div className="space-y-3 p-6 rounded-2xl bg-primary/5 border border-primary/10">
                                <div className="flex items-center gap-2 text-primary">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Data Protection & Risk</span>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    While we protect user data and session tokens with encryption, our service involves third-party modules that carry inherent risks.
                                    <span className="text-white font-bold"> This service is not 100% free;</span> you must pay for hosting and deployment via coins or subscriptions.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
