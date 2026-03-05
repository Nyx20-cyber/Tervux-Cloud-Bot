"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Search, ChevronLeft, ChevronRight, Loader2, Receipt,
    Filter, Download, CreditCard
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface PaymentRecord {
    _id: string;
    userId?: { _id: string; email?: string; name?: string; phone?: string };
    planId?: { _id: string; name?: string; price?: number; coinsAmount?: number };
    amount: number;
    currency: string;
    status: "pending" | "completed" | "failed" | "cancelled";
    payerPhone: string;
    fastlipaTransactionId?: string;
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
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);

    const fetchPayments = useCallback(async (p: number, status?: string, q?: string) => {
        setIsLoading(true);
        try {
            let url = `/admin/payments?page=${p}&limit=15`;
            if (status && status !== "all") url += `&status=${status}`;
            if (q) url += `&search=${encodeURIComponent(q)}`;

            const res = await api.get(url);
            setPayments(res.data.payments);
            setTotal(res.data.total);
            setPages(res.data.pages);
            setPage(res.data.page);
            setTotalAmount(res.data.totalAmount);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPayments(1, statusFilter, search);
    }, [fetchPayments, statusFilter, search]);

    const handleExportCSV = () => {
        if (payments.length === 0) return;
        const headers = ["Date", "Transaction ID", "User", "Phone", "Plan", "Amount", "Status"];
        const rows = payments.map(p => [
            format(new Date(p.createdAt), "yyyy-MM-dd HH:mm"),
            p.fastlipaTransactionId || p._id.slice(-8),
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
            className="space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Payment History</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        {total}
                    </span>
                </div>

                {/* Summary card */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5">
                        <CreditCard className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                            {totalAmount.toLocaleString()} TZS
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
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search phone or ref..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 backdrop-blur-md transition-all uppercase tracking-widest"
                    />
                </div>

                {/* Status filter pills */}
                <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-gray-500 mr-1" />
                    {statuses.map((s) => (
                        <button
                            key={s}
                            onClick={() => { setStatusFilter(s); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[9px] text-gray-500 uppercase tracking-widest bg-white/[0.03] border-b border-white/10">
                                <tr>
                                    <th className="px-5 py-4 font-black">Date</th>
                                    <th className="px-5 py-4 font-black">Ref ID</th>
                                    <th className="px-5 py-4 font-black">User</th>
                                    <th className="px-5 py-4 font-black">Payer Phone</th>
                                    <th className="px-5 py-4 font-black">Plan</th>
                                    <th className="px-5 py-4 font-black">Amount</th>
                                    <th className="px-5 py-4 font-black">Status</th>
                                    <th className="px-5 py-4 font-black">Reason</th>
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
                                                    {p.fastlipaTransactionId || p._id.slice(-8)}
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
                                                        <p className="text-[9px] text-gray-600 font-semibold mt-0.5">{p.planId.coinsAmount} coins</p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-primary font-black tracking-widest text-xs whitespace-nowrap">
                                                    {p.amount.toLocaleString()} TZS
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${sc.bg} ${sc.text} border ${sc.border}`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-[10px] text-red-400/70 font-semibold max-w-[150px] truncate">
                                                    {p.failureReason || "—"}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                                {payments.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                            {search || statusFilter !== "all" ? "No payments match your filters" : "No payments found"}
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
                            Page {page} of {pages} · {total} payments
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
        </motion.div>
    );
}
