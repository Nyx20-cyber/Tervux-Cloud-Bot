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
    const tr = (key: keyof typeof translations.en, vars?: Record<string, string | number>) => {
        const template = String(t[key] ?? translations.en[key] ?? "");
        if (!vars) return template;
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), template);
    };
    const [plans, setPlans] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { checkAuth } = useAuthStore();
    const router = useRouter();

    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const bestValuePlanId = plans.length
        ? [...plans].sort((a, b) => (b.coinsAmount / Math.max(b.price, 1)) - (a.coinsAmount / Math.max(a.price, 1)))[0]?._id
        : null;

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
                toast.success(t.payment_success_coins_added);
                if (data.coins) useAuthStore.getState().updateCoins(data.coins);
                setIsProcessing(false);
                setIsCheckoutOpen(false);
                checkAuth();
                router.push("/dashboard");
            } else if (status === "cancelled") {
                toast.warning(t.payment_cancelled, { duration: 6000 });
                setIsProcessing(false);
            } else if (status === "failed") {
                toast.error(t.payment_failed_try_again);
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
                toast.warning(t.payment_verification_timeout, { duration: 8000 });
            }
        }, 150000);
    }, [checkAuth, router, t]);

    const handleCheckout = async () => {
        const normalizedPhone = phoneNumber.replace(/\D/g, "");

        if (!normalizedPhone || normalizedPhone.length < 10) {
            toast.error(t.enter_valid_phone);
            return;
        }

        setIsProcessing(true);
        try {
            const res = await api.post("/subscription/checkout", {
                planSlug: selectedPlan.slug,
                payerPhone: normalizedPhone
            });

            toast.success(t.payment_request_sent);
            pollPaymentStatus(res.data.paymentId);
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.paymentId) {
                toast.warning(error.response?.data?.error || t.payment_request_sent);
                pollPaymentStatus(error.response.data.paymentId);
                return;
            }
            toast.error(error.response?.data?.error || t.failed_initiate_payment);
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Header */}
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] backdrop-blur-xl p-6 sm:p-8">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-2.5 sm:gap-3">
                    <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-primary/15 border border-primary/30">
                        <CircleDollarSign className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                    </div>
                    {t.billing_title}
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-3">
                    {t.billing_desc}
                </p>
            </div>

            {/* Plans Grid */}
            <div id="plans-section" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {isLoading ? (
                    <div className="col-span-3 flex justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : plans.map((plan: any) => (
                    <div key={plan._id} className="relative group">
                        {plan._id === bestValuePlanId && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-primary text-black text-[9px] font-black uppercase tracking-widest shadow-lg shadow-primary/30">
                                {t.billing_best_value}
                            </div>
                        )}
                        <div className={`absolute -inset-0.5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-500 ${plan._id === bestValuePlanId ? "bg-primary/35" : "bg-white/20"}`} />
                        <div className={`relative p-5 sm:p-7 rounded-2xl sm:rounded-3xl border h-full flex flex-col transition-all duration-500 hover:-translate-y-1.5 backdrop-blur-xl ${plan._id === bestValuePlanId
                                ? "border-primary/40 bg-gradient-to-b from-primary/10 to-black/40"
                                : "border-white/10 bg-card/60"
                            }`}>
                            <div className="flex items-start justify-between gap-3">
                                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight leading-tight">{plan.name}</h3>
                                <div className="text-[9px] font-black uppercase tracking-[0.15em] text-primary bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-full">
                                    {plan.coinsAmount} {t.coins_included_short}
                                </div>
                            </div>

                            <div className="mt-5 flex items-end gap-2">
                                <div className="text-3xl sm:text-4xl font-black text-white tabular-nums leading-none">
                                    {plan.price.toLocaleString()}
                                </div>
                                <span className="pb-1 text-xs font-bold text-gray-500 uppercase tracking-widest">TZS</span>
                            </div>

                            <div className="mt-4 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{t.billing_plan_summary}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                                    {tr("deploy_up_to_bots", { count: Math.floor(plan.coinsAmount / 50) })}
                                </p>
                            </div>

                            <ul className="mt-4 sm:mt-5 space-y-3 flex-1">
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </div>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {t.unlimited_messages}
                                    </span>
                                </li>
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {t.priority_support}
                                    </span>
                                </li>
                                <li className="flex items-center gap-3 group/item">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover/item:scale-110 transition-transform">
                                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                                        {t.billing_instant_activation}
                                    </span>
                                </li>
                            </ul>

                            <Button
                                onClick={() => { setSelectedPlan(plan); setIsCheckoutOpen(true); }}
                                className={`mt-6 sm:mt-7 w-full border transition-all font-black uppercase tracking-[0.14em] sm:tracking-[0.16em] text-[10px] h-11 sm:h-12 rounded-xl sm:rounded-2xl ${plan._id === bestValuePlanId
                                        ? "bg-primary text-black hover:bg-primary/90 border-primary"
                                        : "bg-white/5 border-white/10 hover:border-primary text-white hover:text-black hover:bg-primary"
                                    }`}
                            >
                                {t.select_package}
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Checkout Dialog */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-white/10 backdrop-blur-2xl rounded-2xl sm:rounded-3xl p-0 overflow-hidden">
                    <div className="p-6 sm:p-8 bg-gradient-to-b from-white/[0.03] to-transparent">
                    <DialogHeader>
                        <DialogTitle className="text-lg sm:text-xl font-black text-white uppercase tracking-widest">{t.confirm_payment}</DialogTitle>
                        <DialogDescription className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed pt-2">
                            {tr("billing_confirm_desc", {
                                name: selectedPlan?.name || "",
                                price: selectedPlan?.price?.toLocaleString?.() || "",
                                amount: selectedPlan?.coinsAmount || 0
                            })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-5">
                        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                            <p className="text-[9px] font-black uppercase tracking-widest text-primary/80">{t.billing_plan_summary}</p>
                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-sm font-black uppercase tracking-wide text-white">{selectedPlan?.name || "-"}</p>
                                <p className="text-sm font-black text-primary">{selectedPlan?.price?.toLocaleString?.() || "0"} TZS</p>
                            </div>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                {selectedPlan?.coinsAmount || 0} {t.coins_included_short}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">
                                {t.enter_mobile_number}
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#E60000]/10 text-[#FF4D4D] border border-[#E60000]/30 uppercase tracking-[0.1em]">M-Pesa</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#0055A5]/10 text-[#66A3FF] border border-[#0055A5]/30 uppercase tracking-[0.1em]">Tigo Pesa</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF0000]/10 text-[#FF4D4D] border border-[#FF0000]/30 uppercase tracking-[0.1em]">Airtel</span>
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF6600]/10 text-[#FF9933] border border-[#FF6600]/30 uppercase tracking-[0.1em]">HaloPesa</span>
                            </div>
                            <Input
                                placeholder={t.billing_phone_placeholder}
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="bg-black/50 border-white/10 text-white placeholder:text-gray-700 focus-visible:ring-primary h-12 sm:h-14 rounded-xl sm:rounded-2xl font-mono text-base sm:text-lg tracking-widest"
                            />
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
                                {t.billing_secure_checkout}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button onClick={handleCheckout} disabled={isProcessing} className="w-full h-12 sm:h-14 bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[10px] sm:text-[11px] rounded-xl sm:rounded-2xl shadow-xl shadow-primary/20">
                            {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.processing}</> : t.pay_now}
                        </Button>
                        <Button variant="ghost" onClick={() => !isProcessing && setIsCheckoutOpen(false)} disabled={isProcessing} className="w-full h-12 text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-white hover:bg-white/5 rounded-xl">
                            {t.cancel}
                        </Button>
                    </div>
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
