"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Search, ChevronLeft, ChevronRight, Loader2, Receipt,
    Filter, Download, CreditCard, Trash2, RefreshCw
} from "lucide-react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PaymentRecord {
    _id: string;
    userId?: { _id: string; email?: string; name?: string; phone?: string };
    planId?: { _id: string; name?: string; price?: number; coinsAmount?: number };
    amount: number;
    currency: string;
    provider?: "fastlipa" | "zenopay" | "bongopay";
    paymentMethod?: "mobile_money_tz" | "card";
    status: "pending" | "completed" | "failed" | "cancelled";
    payerPhone: string;
    fastlipaTransactionId?: string;
    gatewayReference?: string;
    failureReason?: string;
    createdAt: string;
}

const statusConfig: Record<string, { bg: string; text: string; border: string }> = {
    completed: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
    pending: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
    failed: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
    cancelled: { bg: "bg-gray-500/20", text: "text-gray-400", border: "border-gray-500/30" },
};

export function PaymentHistory() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [fastlipaAmount, setFastlipaAmount] = useState(0);
    const [cardAmount, setCardAmount] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [reconcilingId, setReconcilingId] = useState<string | null>(null);
    const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
    const [confirmReconcilePaymentId, setConfirmReconcilePaymentId] = useState<string | null>(null);
    const tr = (key: string, fallback: string) => (t as Record<string, string>)[key] || fallback;

    const fetchPayments = useCallback(async (p: number, status?: string, q?: string, from?: string, to?: string) => {
        setIsLoading(true);
        try {
            let url = `/admin/payments?page=${p}&limit=15`;
            if (status && status !== "all") url += `&status=${status}`;
            if (q) url += `&search=${encodeURIComponent(q)}`;
            if (from) url += `&from=${encodeURIComponent(from)}`;
            if (to) url += `&to=${encodeURIComponent(to)}`;

            const res = await api.get(url);
            setPayments(res.data.payments);
            setTotal(res.data.total);
            setPages(res.data.pages);
            setPage(res.data.page);
            setTotalAmount(res.data.totalAmount);
            setFastlipaAmount(res.data.fastlipaAmount || 0);
            setCardAmount(res.data.cardAmount || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPayments(1, statusFilter, search, fromDate, toDate);
    }, [fetchPayments, statusFilter, search, fromDate, toDate]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_payment_deleted", (payload: { paymentId: string }) => {
            setPayments(prev => prev.filter(p => p._id !== payload.paymentId));
            setTotal(prev => Math.max(0, prev - 1));
            fetchPayments(page, statusFilter, search, fromDate, toDate);
        });
        socket.on("admin_payment_updated", () => {
            fetchPayments(page, statusFilter, search, fromDate, toDate);
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchPayments, fromDate, page, search, statusFilter, toDate, token]);

    const handleDeletePayment = async (paymentId: string) => {
        setDeletingId(paymentId);
        try {
            await api.delete(`/admin/payments/${paymentId}`);
            setPayments(prev => prev.filter(p => p._id !== paymentId));
            setTotal(prev => Math.max(0, prev - 1));
            toast.success(t.admin_payment_deleted);
            fetchPayments(page, statusFilter, search, fromDate, toDate);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_delete_payment);
        } finally {
            setDeletingId(null);
            setConfirmDeletePaymentId(null);
        }
    };

    const handleReconcilePayment = async (paymentId: string) => {
        setReconcilingId(paymentId);
        try {
            const res = await api.post(`/admin/payments/${paymentId}/reconcile`);
            const action = res.data?.action;

            if (action === "completed") {
                toast.success(tr("admin_payment_reconcile_completed", "Payment settled successfully and coins credited."));
            } else if (action === "failed") {
                toast.warning(tr("admin_payment_reconcile_failed", "Payment marked as failed/cancelled after verification."));
            } else {
                toast.message(tr("admin_payment_reconcile_pending", "Payment is still pending at provider. Try again shortly."));
            }

            fetchPayments(page, statusFilter, search, fromDate, toDate);
        } catch (err: any) {
            toast.error(err.response?.data?.error || tr("admin_payment_reconcile_error", "Failed to reconcile payment"));
        } finally {
            setReconcilingId(null);
            setConfirmReconcilePaymentId(null);
        }
    };

    const handleExportCSV = () => {
        if (payments.length === 0) return;
        const headers = [t.admin_date, t.admin_transaction_id, t.users, t.phone_number, t.plans, t.admin_amount, t.status_label];
        const rows = payments.map(p => [
            format(new Date(p.createdAt), "yyyy-MM-dd HH:mm"),
            p.fastlipaTransactionId || p.gatewayReference || p._id.slice(-8),
            p.userId?.name || p.userId?.email || "—",
            p.payerPhone,
            p.planId?.name || "—",
            p.amount,
            p.status,
        ]);
        const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payments_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const statuses = ["all", "completed", "pending", "failed", "cancelled"];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3 sm:space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">{t.admin_payment_history}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        {total}
                    </span>
                </div>

                {/* Summary card */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5">
                        <CreditCard className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                            {totalAmount.toLocaleString()} TZS
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                            {tr("admin_fastlipa_total", "FastLipa")}: {fastlipaAmount.toLocaleString()} TZS
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-300">
                            {tr("admin_bongopay_total", "BongoPay")}: {cardAmount.toLocaleString()} TZS
                        </span>
                    </div>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-all"
                    >
                        <Download className="h-3 w-3" />
                        CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3">
                {/* Search */}
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder={t.admin_search_phone_or_ref}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 backdrop-blur-md transition-all uppercase tracking-widest"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-auto">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{tr("admin_from_date", "From")}</span>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                    className="min-w-[160px] w-full cursor-pointer pr-10 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                />
                                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{tr("admin_to_date", "To")}</span>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                    className="min-w-[160px] w-full cursor-pointer pr-10 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                />
                                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-gray-500 mr-1" />
                    {statuses.map((s) => (
                        <button
                            key={s}
                            onClick={() => { setStatusFilter(s); setPage(1); }}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                                }`}
                        >
                            {t[`admin_status_${s}` as keyof typeof t] || s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1120px] text-sm text-left">
                            <thead className="text-[9px] text-gray-500 uppercase tracking-widest bg-white/[0.03] border-b border-white/10">
                                <tr>
                                    <th className="px-5 py-4 font-black">{t.admin_date}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_ref_id}</th>
                                    <th className="px-5 py-4 font-black">{t.users}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_payer_phone}</th>
                                    <th className="px-5 py-4 font-black">{t.plans}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_amount}</th>
                                    <th className="px-5 py-4 font-black">{t.status_label}</th>
                                    <th className="px-5 py-4 font-black">{t.admin_reason}</th>
                                    <th className="px-5 py-4 font-black text-right">{t.admin_actions}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <AnimatePresence>
                                    {payments.map((p) => {
                                        const sc = statusConfig[p.status] || statusConfig.cancelled;
                                        return (
                                            <motion.tr
                                                key={p._id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="hover:bg-white/[0.04] transition-colors"
                                            >
                                                <td className="px-5 py-4 text-[10px] tracking-widest text-gray-500 font-semibold whitespace-nowrap">
                                                    {format(new Date(p.createdAt), "MMM dd, HH:mm")}
                                                </td>
                                                <td className="px-5 py-4 text-white font-mono text-[10px] tracking-wider">
                                                    {p.fastlipaTransactionId || p.gatewayReference || p._id.slice(-8)}
                                                    <p className="mt-1 text-[9px] text-gray-600 font-semibold uppercase tracking-widest">
                                                        {p.provider === "bongopay"
                                                            ? "BongoPay"
                                                            : p.provider === "zenopay"
                                                                ? "ZenoPay Card"
                                                                : "FastLipa Mobile Money"}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-300">{p.userId?.name || "—"}</p>
                                                        <p className="text-[10px] text-gray-600 font-semibold">{p.userId?.email || ""}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-xs font-mono text-gray-400 tracking-wider">
                                                    {p.payerPhone}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                                                        {p.planId?.name || "—"}
                                                    </span>
                                                    {p.planId?.coinsAmount && (
                                                        <p className="text-[9px] text-gray-600 font-semibold mt-0.5">{p.planId.coinsAmount} {t.coins_word}</p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-primary font-black tracking-widest text-xs whitespace-nowrap">
                                                    {p.amount.toLocaleString()} TZS
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${sc.bg} ${sc.text} border ${sc.border}`}>
                                                        {t[`admin_status_${p.status}` as keyof typeof t] || p.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-[10px] text-red-400/70 font-semibold max-w-[150px] truncate">
                                                    {p.failureReason || "—"}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex justify-end">
                                                        <button
                                                            onClick={() => setConfirmReconcilePaymentId(p._id)}
                                                            disabled={reconcilingId === p._id || p.status === "completed"}
                                                            title={tr("admin_reconcile", "Reconcile")}
                                                            className="p-2 mr-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all text-primary disabled:opacity-40"
                                                        >
                                                            {reconcilingId === p._id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeletePaymentId(p._id)}
                                                            disabled={deletingId === p._id}
                                                            title={t.delete}
                                                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all text-red-400 disabled:opacity-40"
                                                        >
                                                            {deletingId === p._id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                                {payments.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-5 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                            {search || statusFilter !== "all" ? t.admin_no_payments_match_filters : t.admin_no_payments_found}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-white/[0.02]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            {t.admin_page} {page} {t.admin_of} {pages} · {total} {t.payments}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => fetchPayments(page - 1, statusFilter, search)}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                                onClick={() => fetchPayments(page + 1, statusFilter, search)}
                                disabled={page >= pages}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={!!confirmDeletePaymentId} onOpenChange={(open) => !open && !deletingId && setConfirmDeletePaymentId(null)}>
                <DialogContent className="max-w-md border-white/10 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_delete_payment_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {t.admin_confirm_delete_payment}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!deletingId}
                            onClick={() => setConfirmDeletePaymentId(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!deletingId || !confirmDeletePaymentId}
                            onClick={() => confirmDeletePaymentId && handleDeletePayment(confirmDeletePaymentId)}
                            className="bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                        >
                            {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : t.delete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!confirmReconcilePaymentId} onOpenChange={(open) => !open && !reconcilingId && setConfirmReconcilePaymentId(null)}>
                <DialogContent className="max-w-md border-primary/20 bg-[#0e0e0e] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {tr("admin_reconcile_payment_title", "Reconcile Payment")}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-400 leading-relaxed">
                            {tr("admin_reconcile_payment_desc", "This checks FastLipa for the latest status and updates this payment accordingly. Use this if webhook is delayed.")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!!reconcilingId}
                            onClick={() => setConfirmReconcilePaymentId(null)}
                            className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            type="button"
                            disabled={!!reconcilingId || !confirmReconcilePaymentId}
                            onClick={() => confirmReconcilePaymentId && handleReconcilePayment(confirmReconcilePaymentId)}
                            className="bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 hover:text-white"
                        >
                            {reconcilingId ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("admin_reconcile_now", "Reconcile now")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
