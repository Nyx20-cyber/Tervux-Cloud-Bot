"use client";

import { useEffect, useState, Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CircleDollarSign, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function BillingContent() {
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

    const handleCheckout = async () => {
        if (!phoneNumber || phoneNumber.length < 9) {
            toast.error("Please enter a valid phone number for payment");
            return;
        }

        setIsProcessing(true);
        try {
            const res = await api.post("/subscription/checkout", {
                planSlug: selectedPlan.slug,
                payerPhone: phoneNumber
            });

            toast.success("Payment request sent to your phone. Please enter your PIN.");
            // Open a polling interval or wait
            pollPaymentStatus(res.data.paymentId);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to initiate payment");
            setIsProcessing(false);
        }
    };

    const pollPaymentStatus = (paymentId: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/subscription/payment-status/${paymentId}`);
                if (res.data.status === "completed") {
                    clearInterval(interval);
                    toast.success(res.data.message || "Payment successful! Coins added.");
                    useAuthStore.getState().updateCoins(res.data.coins);
                    setIsProcessing(false);
                    setIsCheckoutOpen(false);
                    checkAuth(); // refresh user object
                    router.push("/dashboard");
                } else if (res.data.status === "failed") {
                    clearInterval(interval);
                    toast.error("Payment failed or was cancelled.");
                    setIsProcessing(false);
                }
            } catch (error) {
                console.error("Polling error", error);
            }
        }, 5000);

        // Timeout after 2 minutes
        setTimeout(() => {
            clearInterval(interval);
            if (isProcessing) {
                setIsProcessing(false);
                toast.error("Payment verification timed out. If you paid, it will be updated shortly.");
            }
        }, 120000);
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                    <CircleDollarSign className="h-8 w-8 text-primary" />
                    Buy Coins 🪙
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Purchase credits to deploy more devices</p>
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
                        <div className="relative p-8 rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl h-full flex flex-col hover:-translate-y-2 transition-transform duration-500">
                            <h3 className="text-xl font-bold text-white capitalize">{plan.name} 🪙</h3>
                            <div className="mt-4 flex items-baseline text-4xl font-extrabold text-primary">
                                {plan.price}
                                <span className="ml-1 text-xl font-medium text-gray-500">TZS</span>
                            </div>
                            <p className="mt-2 text-xs text-gray-400 uppercase tracking-widest font-bold">{plan.coinsAmount} Coins Included 🪙</p>

                            <ul className="mt-8 space-y-4 flex-1">
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Deploy up to {Math.floor(plan.coinsAmount / 50)} Bot(s)</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Unlimited Messages</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Priority Support</span>
                                </li>
                            </ul>

                            <Button
                                onClick={() => { setSelectedPlan(plan); setIsCheckoutOpen(true); }}
                                className="mt-8 w-full bg-white/5 border border-white/10 hover:border-primary text-white hover:text-black transition-all hover:bg-primary font-bold uppercase tracking-widest text-xs h-12"
                            >
                                Select Package
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Checkout Dialog */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent className="sm:max-w-md bg-card/90 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white uppercase tracking-widest">Confirm Payment</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            You are about to purchase the <span className="text-white font-bold">{selectedPlan?.name}</span> for <span className="text-white font-bold">{selectedPlan?.price} TZS</span>. You will receive {selectedPlan?.coinsAmount} coins 🪙.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed block">
                                Enter Mobile Number
                            </label>
                            <div className="flex flex-wrap gap-2 mt-1 mb-3">
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#E60000]/10 text-[#FF4D4D] border border-[#E60000]/30">M-Pesa</span>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#0055A5]/10 text-[#66A3FF] border border-[#0055A5]/30">Tigo Pesa</span>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#FF0000]/10 text-[#FF4D4D] border border-[#FF0000]/30">Airtel</span>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#FF6600]/10 text-[#FF9933] border border-[#FF6600]/30">HaloPesa</span>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#005B9F]/10 text-[#66B3FF] border border-[#005B9F]/30">T-Pesa</span>
                            </div>
                            <Input
                                placeholder="07XXXXXXXX or 06XXXXXXXX"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="bg-black/50 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-primary h-12"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => !isProcessing && setIsCheckoutOpen(false)} disabled={isProcessing} className="text-gray-400 hover:text-white">
                            Cancel
                        </Button>
                        <Button onClick={handleCheckout} disabled={isProcessing} className="bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest">
                            {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing</> : 'Pay Now'}
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
