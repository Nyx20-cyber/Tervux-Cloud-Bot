"use client";

import { useEffect, useState, Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CircleDollarSign, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/store/useAuthStore";
import { useSessionStore } from "@/store/useSessionStore";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function BillingContent() {
    const [plans, setPlans] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { sessions, fetchSessions } = useSessionStore();
    const searchParams = useSearchParams();
    const router = useRouter();

    const preSelectedSessionId = searchParams.get("session");
    const [selectedSessionId, setSelectedSessionId] = useState<string>(preSelectedSessionId || "");
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        fetchSessions();
        api.get("/subscription/plans").then(res => {
            setPlans(res.data.plans || []);
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            setIsLoading(false);
        });
    }, [fetchSessions]);

    // Force selection of first active session if none selected and available
    useEffect(() => {
        if (!selectedSessionId && sessions.length > 0) {
            setSelectedSessionId(sessions[0]._id);
        }
        if (selectedSessionId) {
            document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" });
        }
    }, [sessions, selectedSessionId]);

    const handleCheckout = async () => {
        if (!phoneNumber || phoneNumber.length < 9) {
            toast.error("Please enter a valid phone number for payment");
            return;
        }

        setIsProcessing(true);
        try {
            const res = await api.post("/subscription/checkout", {
                planId: selectedPlan._id,
                phoneNumber,
                sessionId: selectedSessionId
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
                const res = await api.get(`/subscription/payment-status/${paymentId}?sessionId=${selectedSessionId}`);
                if (res.data.status === "completed") {
                    clearInterval(interval);
                    toast.success("Payment successful! Session upgraded.");
                    setIsProcessing(false);
                    setIsCheckoutOpen(false);
                    fetchSessions();
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
                    Subscription Plans
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Choose the best plan for your needs</p>
            </div>

            {/* Session Selection */}
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-4">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Select Device</h2>
                {sessions.length === 0 ? (
                    <p className="text-xs text-gray-400">No active nodes available. Pair a device first.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {sessions.map(s => (
                            <div
                                key={s._id}
                                onClick={() => setSelectedSessionId(s._id)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${selectedSessionId === s._id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-white">{s.phone}</p>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">{s.status}</p>
                                </div>
                                {selectedSessionId === s._id && (
                                    <CheckCircle2 className="w-5 h-5 text-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
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
                            <h3 className="text-xl font-bold text-white capitalize">{plan.name}</h3>
                            <div className="mt-4 flex items-baseline text-4xl font-extrabold text-primary">
                                {plan.price}
                                <span className="ml-1 text-xl font-medium text-gray-500">TZS</span>
                            </div>
                            <p className="mt-2 text-xs text-gray-400 uppercase tracking-widest font-bold">{plan.durationDays} Days Duration</p>

                            <ul className="mt-8 space-y-4 flex-1">
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Unlimited Messages</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Priority Support</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-sm text-gray-300">Standard Groups limit</span>
                                </li>
                            </ul>

                            <Button
                                onClick={() => { setSelectedPlan(plan); setIsCheckoutOpen(true); }}
                                disabled={!selectedSessionId}
                                className="mt-8 w-full bg-white/5 border border-white/10 hover:border-primary text-white hover:text-black transition-all hover:bg-primary font-bold uppercase tracking-widest text-xs h-12"
                            >
                                Select Plan
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
                            You are about to upgrade device <span className="text-primary font-bold">{sessions.find(s => s._id === selectedSessionId)?.phone}</span> to <span className="text-white font-bold">{selectedPlan?.name}</span> plan for <span className="text-white font-bold">{selectedPlan?.price} TZS</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">M-Pesa / Tigo Pesa Number</label>
                            <Input
                                placeholder="07XXXXXXXX"
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
