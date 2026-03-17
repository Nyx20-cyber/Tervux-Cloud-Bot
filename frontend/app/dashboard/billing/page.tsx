"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CircleDollarSign, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
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
    const searchParams = useSearchParams();
    const { checkAuth, user } = useAuthStore();
    const router = useRouter();

    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
    const [paymentMarket, setPaymentMarket] = useState<"tanzania" | "international">("tanzania");
    const resumePollRef = useRef<string | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const EXCHANGE_RATES = {
        USD_TO_TZS: 2605,
        KES_TO_TZS: 20.01,
        UGX_TO_TZS: 0.7334
    } as const;
    const bestValuePlanId = plans.length
        ? [...plans].sort((a, b) => (b.coinsAmount / Math.max(b.price, 1)) - (a.coinsAmount / Math.max(a.price, 1)))[0]?._id
        : null;

    const isValidInternationalPhone = (value: string) => /^[1-9]\d{11}$/.test(value.trim());
    const formatInternationalPhoneInput = (value: string) => {
        return value.replace(/\D/g, "").slice(0, 12);
    };
    const normalizeTanzaniaPhoneInput = (value: string) => {
        const digits = value.replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("255") && digits.length <= 12) {
            return `0${digits.slice(3, 12)}`;
        }
        if (digits.startsWith("0")) {
            return digits.slice(0, 10);
        }
        if (/^[67]\d{0,8}$/.test(digits)) {
            return `0${digits}`.slice(0, 10);
        }
        return digits.slice(0, 10);
    };
    const getApproxPlanCurrencies = (tzsAmount: number) => {
        const amount = Number(tzsAmount) || 0;
        return {
            kes: Math.round(amount / EXCHANGE_RATES.KES_TO_TZS),
            ugx: Math.round(amount / EXCHANGE_RATES.UGX_TO_TZS),
            usd: (amount / EXCHANGE_RATES.USD_TO_TZS).toFixed(2)
        };
    };

    useEffect(() => {
        api.get("/plans").then(res => {
            setPlans(res.data.plans || []);
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            setIsLoading(false);
        });
    }, []);

    const stopPaymentTracking = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    const pollPaymentStatus = useCallback((paymentId: string) => {
        stopPaymentTracking();
        let resolved = false;

        const handleResolved = (status: string, data: any) => {
            if (resolved) return;
            resolved = true;
            stopPaymentTracking();
            setActivePaymentId(null);

            if (status === "completed") {
                toast.success(t.payment_success_coins_added);
                if (data.coins) useAuthStore.getState().updateCoins(data.coins);
                setIsProcessing(false);
                setIsCheckoutOpen(false);
                checkAuth();
                router.push("/dashboard/billing");
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
        socketRef.current = socket;

        socket.on("payment_update", (data: { paymentId: string; status: string; message: string; coins?: number }) => {
            if (data.paymentId === paymentId) {
                handleResolved(data.status, data);
            }
        });

        pollIntervalRef.current = setInterval(async () => {
            if (resolved) return;
            try {
                const res = await api.get(`/subscription/payment-status/${paymentId}`);
                if (res.data.status !== "pending") {
                    handleResolved(res.data.status, res.data);
                }
            } catch (error: any) {
                if (error?.response?.status === 404) {
                    handleResolved("cancelled", { message: "Payment was cancelled." });
                    return;
                }
                console.error("Polling error", error);
            }
        }, 10000);

        pollTimeoutRef.current = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                stopPaymentTracking();
                setIsProcessing(false);
                setActivePaymentId(null);
                toast.warning(t.payment_verification_timeout, { duration: 8000 });
            }
        }, 150000);
    }, [checkAuth, router, stopPaymentTracking, t]);

    useEffect(() => () => {
        stopPaymentTracking();
    }, [stopPaymentTracking]);

    useEffect(() => {
        const paymentId = searchParams.get("paymentId");
        const provider = searchParams.get("provider");
        if (!paymentId || (provider !== "bongopay" && provider !== "zenopay") || resumePollRef.current === paymentId) return;

        resumePollRef.current = paymentId;
        setIsProcessing(true);
        setActivePaymentId(paymentId);
        pollPaymentStatus(paymentId);
    }, [pollPaymentStatus, searchParams]);

    const handleCheckout = async () => {
        const rawPhone = phoneNumber.trim();
        const normalizedPhone = rawPhone.replace(/\D/g, "");

        if (paymentMarket === "international") {
            if (!isValidInternationalPhone(rawPhone)) {
                toast.error(t.billing_card_phone_invalid);
                return;
            }
        } else if (!normalizedPhone || normalizedPhone.length < 10) {
            toast.error(t.enter_valid_phone);
            return;
        }

        setIsProcessing(true);
        try {
            if (paymentMarket === "international") {
                const res = await api.post("/subscription/checkout/card", {
                    planSlug: selectedPlan.slug,
                    buyerPhone: normalizedPhone
                });

                if (res.data?.paymentUrl) {
                    if (res.data?.paymentId) setActivePaymentId(res.data.paymentId);
                    toast.success(t.billing_card_redirecting_to_checkout);
                    window.location.href = res.data.paymentUrl;
                    return;
                }
                throw new Error(t.billing_card_start_failed);
            } else {
                const res = await api.post("/subscription/checkout", {
                    planSlug: selectedPlan.slug,
                    payerPhone: normalizedPhone
                });

                setActivePaymentId(res.data.paymentId);
                toast.success(t.payment_request_sent);
                pollPaymentStatus(res.data.paymentId);
            }
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.paymentId) {
                setActivePaymentId(error.response.data.paymentId);
                toast.warning(error.response?.data?.error || (paymentMarket === "international" ? t.billing_card_redirecting_to_checkout : t.payment_request_sent));
                if (paymentMarket === "international" && error.response?.data?.paymentUrl) {
                    window.location.href = error.response.data.paymentUrl;
                    return;
                }
                pollPaymentStatus(error.response.data.paymentId);
                return;
            }
            toast.error(error.response?.data?.error || (paymentMarket === "international" ? t.billing_card_start_failed : t.failed_initiate_payment));
            setIsProcessing(false);
        }
    };

    const handleCancelPayment = async () => {
        if (!isProcessing || !activePaymentId) {
            setIsCheckoutOpen(false);
            return;
        }

        try {
            await api.delete(`/subscription/payment/${activePaymentId}`);
            stopPaymentTracking();
            setIsProcessing(false);
            setActivePaymentId(null);
            setIsCheckoutOpen(false);
            toast.success(t.payment_cancelled_removed);
        } catch (error: any) {
            toast.error(error.response?.data?.error || t.payment_cancel_failed);
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
                ) : plans.map((plan: any) => {
                    const approx = getApproxPlanCurrencies(plan.price);
                    return (
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
                                <span className="pb-1 text-xs font-bold text-gray-500 uppercase tracking-widest">🇹🇿 TZS</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-300">
                                    🇰🇪 KES {approx.kes.toLocaleString()}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-300">
                                    🇺🇬 UGX {approx.ugx.toLocaleString()}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-300">
                                    🇺🇸 USD {approx.usd}
                                </span>
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
                    );
                })}
            </div>

            {/* Checkout Dialog */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-950 border-white/10 backdrop-blur-2xl rounded-2xl sm:rounded-3xl p-0">
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
                            <div className="mt-2 flex items-center justify-between gap-3">
                                <p className="text-sm font-black uppercase tracking-wide text-white">{selectedPlan?.name || "-"}</p>
                                {paymentMarket === "international" && selectedPlan ? (() => {
                                    const approx = getApproxPlanCurrencies(selectedPlan.price);
                                    return (
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-200">
                                                🇰🇪 KES {approx.kes.toLocaleString()}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-200">
                                                🇺🇬 UGX {approx.ugx.toLocaleString()}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-200">
                                                🇺🇸 USD {approx.usd}
                                            </span>
                                        </div>
                                    );
                                })() : (
                                    <p className="text-sm font-black text-primary">{selectedPlan?.price?.toLocaleString?.() || "0"} 🇹🇿 TZS</p>
                                )}
                            </div>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                {selectedPlan?.coinsAmount || 0} {t.coins_included_short}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">
                                {t.billing_market_title}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMarket("tanzania")}
                                    className={`rounded-2xl border p-4 text-left transition-all ${paymentMarket === "tanzania"
                                        ? "border-primary/40 bg-primary/10"
                                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                                >
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">{t.billing_market_tanzania_short}</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMarket("international")}
                                    className={`rounded-2xl border p-4 text-left transition-all ${paymentMarket === "international"
                                        ? "border-sky-500/40 bg-sky-500/10"
                                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                                >
                                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">{t.billing_market_international_short}</p>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">
                                {paymentMarket === "international" ? t.billing_card_phone_label : t.enter_mobile_number}
                            </label>
                            {paymentMarket === "tanzania" ? (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#E60000]/10 text-[#FF4D4D] border border-[#E60000]/30 uppercase tracking-[0.1em]">M-Pesa</span>
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#0055A5]/10 text-[#66A3FF] border border-[#0055A5]/30 uppercase tracking-[0.1em]">Tigo Pesa</span>
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF0000]/10 text-[#FF4D4D] border border-[#FF0000]/30 uppercase tracking-[0.1em]">Airtel</span>
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-[#FF6600]/10 text-[#FF9933] border border-[#FF6600]/30 uppercase tracking-[0.1em]">HaloPesa</span>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 uppercase tracking-[0.1em]">Visa</span>
                                    <span className="px-2 py-0.5 text-[8px] font-black rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 uppercase tracking-[0.1em]">Mastercard</span>
                                </div>
                            )}
                            <Input
                                placeholder={paymentMarket === "international" ? t.billing_card_phone_placeholder : t.billing_phone_placeholder}
                                value={phoneNumber}
                                inputMode={paymentMarket === "international" ? "numeric" : "tel"}
                                maxLength={paymentMarket === "international" ? 13 : 10}
                                onChange={(e) => {
                                    const nextValue = e.target.value;
                                    if (paymentMarket === "international") {
                                        setPhoneNumber(formatInternationalPhoneInput(nextValue));
                                        return;
                                    }
                                    setPhoneNumber(normalizeTanzaniaPhoneInput(nextValue));
                                }}
                                className="bg-black/50 border-white/10 text-white placeholder:text-gray-700 focus-visible:ring-primary h-12 sm:h-14 rounded-xl sm:rounded-2xl font-mono text-base sm:text-lg tracking-widest"
                            />
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
                                {paymentMarket === "international" ? t.billing_card_secure_checkout : t.billing_secure_checkout}
                            </p>
                            {paymentMarket === "international" && (
                                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                                    <p className="text-[10px] font-bold tracking-wider text-amber-100">
                                        {t.billing_card_tax_notice}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-white/10 bg-zinc-950/95 px-1 pt-4 pb-1 backdrop-blur">
                        <Button onClick={handleCheckout} disabled={isProcessing} className="w-full h-12 sm:h-14 bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[10px] sm:text-[11px] rounded-xl sm:rounded-2xl shadow-xl shadow-primary/20">
                            {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.processing}</> : (paymentMarket === "international" ? t.billing_continue_to_card : t.pay_now)}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleCancelPayment}
                            className="w-full h-12 rounded-xl border border-red-500/25 bg-red-500/10 text-[10px] font-black uppercase tracking-[0.16em] text-red-300 shadow-[0_0_25px_rgba(239,68,68,0.10)] transition-all duration-200 hover:border-red-400/45 hover:bg-red-500/18 hover:text-red-100 hover:scale-[1.015] active:scale-[0.97] active:bg-red-500/25 motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
                        >
                            {isProcessing && activePaymentId ? t.cancel_payment : t.cancel}
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
