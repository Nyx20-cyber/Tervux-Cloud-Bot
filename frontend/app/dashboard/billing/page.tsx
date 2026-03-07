"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CircleDollarSign, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { io } from "socket.io-client";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

function BillingContent() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const [plans, setPlans] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { checkAuth } = useAuthStore();
    const router = useRouter();

    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        api.get("/plans").then(res => {
            setPlans(res.data.plans || []);
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            setIsLoading(false);
        });
    }, []);

    const pollPaymentStatus = useCallback((paymentId: string) => {
        let resolved = false;

        const handleResolved = (status: string, data: any) => {
            if (resolved) return;
            resolved = true;
            clearInterval(interval);
            clearTimeout(timeout);
            socket?.disconnect();

            if (status === "completed") {
                toast.success(language === "sw" ? "🪙 Malipo yamefanikiwa! Sarafu zimeongezwa." : "🪙 Payment successful! Coins added.");
                if (data.coins) useAuthStore.getState().updateCoins(data.coins);
                setIsProcessing(false);
                setIsCheckoutOpen(false);
                checkAuth();
                router.push("/dashboard");
            } else if (status === "cancelled") {
                toast.warning(language === "sw" ? "Malipo yameghairiwa." : "Payment was cancelled.", { duration: 6000 });
                setIsProcessing(false);
            } else if (status === "failed") {
                toast.error(language === "sw" ? "Malipo yameshindwa. Tafadhali jaribu tena." : "Payment failed. Please try again.");
                setIsProcessing(false);
            }
        };

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const token = useAuthStore.getState().token;
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("payment_update", (data: { paymentId: string; status: string; message: string; coins?: number }) => {
            if (data.paymentId === paymentId) {
                handleResolved(data.status, data);
            }
        });

        const interval = setInterval(async () => {
            if (resolved) return;
            try {
                const res = await api.get(`/subscription/payment-status/${paymentId}`);
                if (res.data.status !== "pending") {
                    handleResolved(res.data.status, res.data);
                }
            } catch (error) {
                console.error("Polling error", error);
            }
        }, 10000);

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                clearInterval(interval);
                socket?.disconnect();
                setIsProcessing(false);
                toast.warning(language === "sw" ? "Muda wa uhakiki umeisha. Sarafu zako 🪙 zitaongezwa punde tu tukipata thibitisho." : "Payment verification timed out. If you paid, your coins 🪙 will be added automatically.", { duration: 8000 });
            }
        }, 150000);
    }, [language, checkAuth, router]);

    const handleCheckout = async () => {
        if (!phoneNumber || phoneNumber.length < 9) {
            toast.error(language === "sw" ? "Tafadhali ingiza namba sahihi" : "Please enter a valid phone number");
            return;
        }

        setIsProcessing(true);
        try {
            const res = await api.post("/checkout", {
                planId: selectedPlan._id,
                phone: phoneNumber
            });

            toast.success(language === "sw" ? "Ombi la malipo limetumwa. Tafadhali weka PIN." : "Payment request sent to your phone. Please enter your PIN.");
            pollPaymentStatus(res.data.paymentId);
        } catch (error: any) {
            toast.error(error.response?.data?.error || (language === "sw" ? "Imeshindwa kuanzisha malipo" : "Failed to initiate payment"));
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                    <CircleDollarSign className="h-8 w-8 text-primary" />
                    {language === "sw" ? "Nunua Sarafu 🪙" : "Buy Coins 🪙"}
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                    {language === "sw" ? "Nunua sarafu ili kuendesha boti zako" : "Purchase credits to deploy more devices"}
                </p>
            </div>

            {/* Plans Grid */}
            <div id="plans-section" className="grid md:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-3 flex justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : plans.map((plan: any) => (
                    <div key={plan._id} className="relative group perspective">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        <div className="relative p-8 rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl h-full flex flex-col hover:-translate-y-2 transition-all duration-500">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">{plan.name} 🪙</h3>
                            <div className="mt-4 flex items-baseline text-4xl font-black text-primary tabular-nums">
                                {plan.price.toLocaleString()}
                                <span className="ml-1 text-xs font-bold text-gray-500 uppercase tracking-widest">TZS</span>
                            </div>
                            <div className="mt-2 text-[10px] text-primary/70 uppercase tracking-[0.2em] font-black bg-primary/10 px-3 py-1 rounded-full w-fit">
                                {plan.coinsAmount} {language === "sw" ? "Sarafu 🪙" : "Coins Included 🪙"}
                            </div>

                            <ul className="mt-8 space-y-4 flex-1">
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {language === "sw" ? `Tumia Boti ${Math.floor(plan.coinsAmount / 50)}` : `Deploy up to ${Math.floor(plan.coinsAmount / 50)} Bot(s)`}
                                    </span>
                                </li>
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {language === "sw" ? "Ujumbe Bila Kikomo" : "Unlimited Messages"}
                                    </span>
                                </li>
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {language === "sw" ? "Msaada wa Haraka" : "Priority Support"}
                                    </span>
                                </li>
                            </ul>

                            <Button
                                onClick={() => { setSelectedPlan(plan); setIsCheckoutOpen(true); }}
                                className="mt-8 w-full bg-white/5 border border-white/10 hover:border-primary text-white hover:text-black transition-all hover:bg-primary font-black uppercase tracking-[0.2em] text-[10px] h-14 rounded-2xl"
                            >
                                {language === "sw" ? "Chagua Kifurushi" : "Select Package"}
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Checkout Dialog */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 backdrop-blur-2xl rounded-3xl p-8">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-white uppercase tracking-widest">{language === "sw" ? "Thibitisha Malipo" : "Confirm Payment"}</DialogTitle>
                        <DialogDescription className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed pt-2">
                            {language === "sw"
                                ? `Unakaribia kununua kifurushi cha ${selectedPlan?.name} kwa TZS ${selectedPlan?.price?.toLocaleString()}. Utapokea sarafu ${selectedPlan?.coinsAmount} 🪙.`
                                : `You are about to purchase the ${selectedPlan?.name} for TZS ${selectedPlan?.price?.toLocaleString()}. You will receive ${selectedPlan?.coinsAmount} coins 🪙.`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">
                                {language === "sw" ? "Namba ya Simu" : "Enter Mobile Number"}
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#E60000]/10 text-[#FF4D4D] border border-[#E60000]/30 uppercase tracking-[0.1em]">M-Pesa</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#0055A5]/10 text-[#66A3FF] border border-[#0055A5]/30 uppercase tracking-[0.1em]">Tigo Pesa</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF0000]/10 text-[#FF4D4D] border border-[#FF0000]/30 uppercase tracking-[0.1em]">Airtel</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF6600]/10 text-[#FF9933] border border-[#FF6600]/30 uppercase tracking-[0.1em]">HaloPesa</span>
                            </div>
                            <Input
                                placeholder="07XXXXXXXX or 06XXXXXXXX"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="bg-black/50 border-white/10 text-white placeholder:text-gray-700 focus-visible:ring-primary h-14 rounded-2xl font-mono text-lg tracking-widest"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button onClick={handleCheckout} disabled={isProcessing} className="w-full h-14 bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl shadow-xl shadow-primary/20">
                            {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {language === "sw" ? "Inachakata..." : "Processing"}</> : (language === "sw" ? "Lipia Sasa" : "Pay Now")}
                        </Button>
                        <Button variant="ghost" onClick={() => !isProcessing && setIsCheckoutOpen(false)} disabled={isProcessing} className="w-full h-12 text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-white hover:bg-white/5 rounded-xl">
                            {language === "sw" ? "Ghairi" : "Cancel"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function BillingPage() {
    return (
        <DashboardLayout>
            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>}>
                <BillingContent />
            </Suspense>
        </DashboardLayout>
    );
}
