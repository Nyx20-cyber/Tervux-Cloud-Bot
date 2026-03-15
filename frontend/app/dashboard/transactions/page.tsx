"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock3, ReceiptText, XCircle } from "lucide-react";

interface PaymentRecord {
    _id: string;
    amount: number;
    currency: string;
    provider?: "fastlipa" | "zenopay" | "bongopay";
    paymentMethod?: "mobile_money_tz" | "card";
    status: "pending" | "completed" | "failed" | "cancelled";
    payerPhone: string;
    fastlipaTransactionId?: string | null;
    gatewayReference?: string | null;
    createdAt: string;
    planId?: {
        name?: string;
        price?: number;
    } | null;
}

const statusStyles = {
    pending: {
        icon: Clock3,
        pill: "bg-amber-500/15 border-amber-500/30 text-amber-300"
    },
    completed: {
        icon: CheckCircle2,
        pill: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
    },
    failed: {
        icon: XCircle,
        pill: "bg-red-500/15 border-red-500/30 text-red-300"
    },
    cancelled: {
        icon: XCircle,
        pill: "bg-gray-500/15 border-gray-500/30 text-gray-300"
    }
};

export default function TransactionsPage() {
    const { language } = useLocaleStore();
    const { token } = useAuthStore();
    const t = translations[language];
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | PaymentRecord["status"]>("all");
    const [dateFilter, setDateFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const dateInputRef = useRef<HTMLInputElement | null>(null);
    const itemsPerPage = 8;

    useEffect(() => {
        const fetchPayments = async () => {
            try {
                setIsLoading(true);
                const res = await api.get("/subscription/payments");
                setPayments(res.data.payments || []);
            } catch {
                toast.error(t.transactions_failed_load);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPayments();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("payment_update", async () => {
            try {
                const res = await api.get("/subscription/payments");
                setPayments(res.data.payments || []);
            } catch {
                // Silent live-refresh failure
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [t.transactions_failed_load, token]);

    const getStatusLabel = (status: PaymentRecord["status"]) => {
        return t[`transactions_status_${status}` as keyof typeof t] as string;
    };

    const openDatePicker = () => {
        if (!dateInputRef.current) return;
        if (typeof dateInputRef.current.showPicker === "function") {
            dateInputRef.current.showPicker();
            return;
        }
        dateInputRef.current.focus();
        dateInputRef.current.click();
    };

    const filteredPayments = useMemo(() => {
        return payments.filter((payment) => {
            const query = searchTerm.trim().toLowerCase();
            const matchesSearch = !query || [
                payment.planId?.name || "",
                payment.payerPhone || "",
                payment.fastlipaTransactionId || "",
                payment.gatewayReference || "",
                payment.provider || "",
                payment.paymentMethod || "",
                payment._id || "",
                payment.amount.toString(),
                payment.currency || ""
            ].some((value) => value.toLowerCase().includes(query));

            const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
            const matchesDate = !dateFilter || payment.createdAt.slice(0, 10) === dateFilter;

            return matchesSearch && matchesStatus && matchesDate;
        });
    }, [payments, searchTerm, statusFilter, dateFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / itemsPerPage));
    const paginatedPayments = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredPayments.slice(start, start + itemsPerPage);
    }, [filteredPayments, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, dateFilter]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-primary/10 via-white/[0.06] to-white/[0.03] backdrop-blur-2xl p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                            <ReceiptText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-white uppercase tracking-tight">{t.transactions_title}</h1>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 max-w-2xl">{t.transactions_desc}</p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-16 text-center">
                        <div className="mx-auto w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="rounded-[2rem] border border-white/10 border-dashed bg-white/[0.03] p-10 text-center">
                        <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight text-white">{t.transactions_empty_title}</h2>
                        <p className="mt-2 text-sm text-gray-400">{t.transactions_empty_desc}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5 backdrop-blur-2xl">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr_auto] xl:items-end">
                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">{t.search}</span>
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder={t.transactions_search_placeholder}
                                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-primary/50"
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">{t.transactions_status}</span>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value as "all" | PaymentRecord["status"])}
                                        className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-primary/50"
                                    >
                                        <option value="all" className="bg-slate-950 text-white">{t.transactions_filter_all}</option>
                                        <option value="pending" className="bg-slate-950 text-white">{t.transactions_status_pending}</option>
                                        <option value="completed" className="bg-slate-950 text-white">{t.transactions_status_completed}</option>
                                        <option value="failed" className="bg-slate-950 text-white">{t.transactions_status_failed}</option>
                                        <option value="cancelled" className="bg-slate-950 text-white">{t.transactions_status_cancelled}</option>
                                    </select>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">{t.transactions_date}</span>
                                    <button
                                        type="button"
                                        onClick={openDatePicker}
                                        className="relative block w-full cursor-pointer text-left"
                                    >
                                        <input
                                            ref={dateInputRef}
                                            type="date"
                                            value={dateFilter}
                                            onChange={(e) => setDateFilter(e.target.value)}
                                            style={{ colorScheme: "dark" }}
                                            className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-black/20 px-4 pr-12 text-sm text-white outline-none transition focus:border-primary/50 [&::-webkit-calendar-picker-indicator]:relative [&::-webkit-calendar-picker-indicator]:z-20 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                        />
                                        <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/85" />
                                    </button>
                                </label>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setStatusFilter("all");
                                        setDateFilter("");
                                    }}
                                    className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
                                >
                                    {t.transactions_clear_filters}
                                </button>
                            </div>
                        </div>

                        {filteredPayments.length === 0 ? (
                            <div className="rounded-[1.75rem] border border-white/10 border-dashed bg-white/[0.03] p-10 text-center">
                                <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight text-white">{t.transactions_no_results_title}</h2>
                                <p className="mt-2 text-sm text-gray-400">{t.transactions_no_results_desc}</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl">
                                    <div className="overflow-x-auto">
                                        <div className="min-w-[760px]">
                                            <div className="grid grid-cols-[1.1fr_0.9fr_1fr_1.2fr_auto] gap-4 border-b border-white/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">
                                                <span>{t.transactions_plan}</span>
                                                <span>{t.transactions_amount}</span>
                                                <span>{t.transactions_phone}</span>
                                                <span>{t.transactions_date}</span>
                                                <span>{t.transactions_status}</span>
                                            </div>

                                            <AnimatePresence initial={false}>
                                                {paginatedPayments.map((payment, index) => {
                                                    const style = statusStyles[payment.status];
                                                    const Icon = style.icon;
                                                    return (
                                                        <motion.article
                                                            key={payment._id}
                                                            initial={{ opacity: 0, y: 14 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -14 }}
                                                            transition={{ delay: index * 0.03 }}
                                                            className="border-b border-white/8 last:border-b-0"
                                                        >
                                                            <div className="grid grid-cols-[1.1fr_0.9fr_1fr_1.2fr_auto] items-center gap-4 px-5 py-3">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-white">
                                                                        {payment.planId?.name || "-"}
                                                                    </p>
                                                                    <p className="mt-1 truncate text-[11px] text-gray-500">
                                                                        {payment.fastlipaTransactionId || payment.gatewayReference || `${t.transactions_reference}: ${payment._id.slice(-8)}`}
                                                                    </p>
                                                                    <p className="mt-1 truncate text-[10px] text-gray-600 uppercase tracking-widest">
                                                                        {payment.provider === "bongopay"
                                                                            ? "BongoPay Card"
                                                                            : payment.provider === "zenopay"
                                                                                ? "ZenoPay Card"
                                                                                : "FastLipa Mobile Money"}
                                                                    </p>
                                                                </div>

                                                                <div>
                                                                    <p className="text-sm font-semibold text-white">
                                                                        {payment.amount.toLocaleString()} {payment.currency}
                                                                    </p>
                                                                </div>

                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-medium text-gray-200">
                                                                        {payment.payerPhone}
                                                                    </p>
                                                                </div>

                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-gray-200">
                                                                        {new Date(payment.createdAt).toLocaleString()}
                                                                    </p>
                                                                </div>

                                                                <div className="flex justify-end">
                                                                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${style.pill}`}>
                                                                        <Icon className="w-3.5 h-3.5" />
                                                                        {getStatusLabel(payment.status)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </motion.article>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-gray-400">
                                        {t.transactions_pagination_summary.replace("{current}", String(currentPage)).replace("{total}", String(totalPages)).replace("{count}", String(filteredPayments.length))}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="h-10 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {t.transactions_previous}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="h-10 rounded-2xl border border-white/10 bg-primary/15 px-4 text-sm font-semibold text-white transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {t.transactions_next}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
