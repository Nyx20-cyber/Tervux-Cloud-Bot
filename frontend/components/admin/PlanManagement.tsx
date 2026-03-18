"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Package, Plus, Pencil, Trash2, X, Save, Loader2, ToggleLeft, ToggleRight, Coins
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PlanRecord {
    _id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    coinsAmount: number;
    description: string;
    isActive: boolean;
    createdAt: string;
}

const emptyPlan = {
    name: "", slug: "", price: 0, currency: "TZS",
    coinsAmount: 0, description: "", isActive: true,
};

export function PlanManagement() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [plans, setPlans] = useState<PlanRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyPlan });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<{
        type: "save" | "delete" | "toggle";
        planId?: string;
        planName: string;
        nextActive?: boolean;
    } | null>(null);

    const fetchPlans = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/plans");
            setPlans(res.data.plans);
        } catch (err) {
            console.error(err);
            toast.error(t.admin_failed_fetch_plans);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_plan_created", (payload: { plan?: PlanRecord }) => {
            if (!payload?.plan?._id) return;
            setPlans(prev => prev.some(p => p._id === payload.plan!._id) ? prev : [...prev, payload.plan!].sort((a, b) => a.price - b.price));
        });

        socket.on("admin_plan_updated", (payload: { plan?: PlanRecord }) => {
            if (!payload?.plan?._id) return;
            setPlans(prev => prev.map(p => p._id === payload.plan!._id ? payload.plan! : p).sort((a, b) => a.price - b.price));
        });

        socket.on("admin_plan_deleted", (payload: { planId?: string }) => {
            if (!payload?.planId) return;
            setPlans(prev => prev.filter(p => p._id !== payload.planId));
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyPlan });
        setShowForm(true);
    };

    const openEdit = (plan: PlanRecord) => {
        setEditingId(plan._id);
        setForm({
            name: plan.name, slug: plan.slug, price: plan.price,
            currency: plan.currency,
            coinsAmount: plan.coinsAmount, description: plan.description,
            isActive: plan.isActive,
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.slug || form.price === undefined) {
            toast.error(t.admin_plan_required_fields);
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                const res = await api.put(`/admin/plans/${editingId}`, form);
                setPlans(prev => prev.map(p => p._id === editingId ? res.data.plan : p));
                toast.success(t.admin_plan_updated);
            } else {
                const res = await api.post("/admin/plans", form);
                setPlans(prev => [...prev, res.data.plan]);
                toast.success(t.admin_plan_created);
            }
            setShowForm(false);
            setEditingId(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_save_plan);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/admin/plans/${id}`);
            setPlans(prev => prev.filter(p => p._id !== id));
            toast.success(t.admin_plan_deleted);
        } catch (err) {
            toast.error(t.admin_failed_delete_plan);
        } finally {
            setDeletingId(null);
        }
    };

    const toggleActive = async (plan: PlanRecord) => {
        try {
            const res = await api.put(`/admin/plans/${plan._id}`, { isActive: !plan.isActive });
            setPlans(prev => prev.map(p => p._id === plan._id ? res.data.plan : p));
            toast.success(plan.isActive ? t.admin_plan_deactivated : t.admin_plan_activated);
        } catch (err) {
            toast.error(t.admin_failed_toggle_plan);
        }
    };

    const runPendingAction = async () => {
        if (!pendingAction) return;

        if (pendingAction.type === "save") {
            await handleSave();
        } else if (pendingAction.type === "delete" && pendingAction.planId) {
            await handleDelete(pendingAction.planId);
        } else if (pendingAction.type === "toggle" && pendingAction.planId) {
            const plan = plans.find((item) => item._id === pendingAction.planId);
            if (plan) await toggleActive(plan);
        }

        setPendingAction(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3 sm:space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-sky-400" />
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">{t.plans}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                        {plans.length}
                    </span>
                </div>
                <button
                    onClick={openCreate}
                    className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t.admin_new_plan}
                </button>
            </div>

            {/* Plan Cards Grid */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : plans.length === 0 ? (
                <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{t.admin_no_plans_created_yet}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <AnimatePresence>
                        {plans.map(plan => (
                            <motion.div
                                key={plan._id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`relative rounded-xl sm:rounded-2xl border backdrop-blur-xl p-4 sm:p-5 space-y-4 transition-all group ${plan.isActive
                                        ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                        : "border-red-500/20 bg-red-500/5 opacity-60"
                                    }`}
                            >
                                {/* Active badge */}
                                <div className="flex items-center justify-between">
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${plan.isActive
                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                                        }`}>
                                        {plan.isActive ? t.admin_active : t.admin_inactive}
                                    </span>
                                    <span className="text-[9px] font-mono text-gray-600 tracking-wider">{plan.slug}</span>
                                </div>

                                {/* Name & Price */}
                                <div>
                                    <h3 className="text-base font-bold text-white tracking-wide">{plan.name}</h3>
                                    <p className="text-2xl font-black text-primary tracking-widest mt-1">
                                        {plan.price.toLocaleString()}
                                        <span className="text-xs text-gray-500 ml-1">{plan.currency}</span>
                                    </p>
                                </div>

                                {/* Details */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{t.coins_word}</span>
                                        <span className="flex items-center gap-1 text-xs font-black text-yellow-500 tracking-widest">
                                            <Coins className="h-3 w-3" />
                                            {plan.coinsAmount}
                                        </span>
                                    </div>
                                    {plan.description && (
                                        <p className="text-[10px] text-gray-500 font-semibold mt-1 line-clamp-2">{plan.description}</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                                    <button
                                        onClick={() => setPendingAction({
                                            type: "toggle",
                                            planId: plan._id,
                                            planName: plan.name,
                                            nextActive: !plan.isActive
                                        })}
                                        title={plan.isActive ? t.admin_deactivate : t.admin_activate}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                                    >
                                        {plan.isActive
                                            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                                            : <ToggleLeft className="w-4 h-4 text-gray-500" />
                                        }
                                    </button>
                                    <button
                                        onClick={() => openEdit(plan)}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setPendingAction({
                                            type: "delete",
                                            planId: plan._id,
                                            planName: plan.name
                                        })}
                                        disabled={deletingId === plan._id}
                                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all text-red-400 ml-auto"
                                    >
                                        {deletingId === plan._id
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Trash2 className="w-3.5 h-3.5" />
                                        }
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-lg max-h-[90vh] rounded-2xl border border-white/10 bg-[#0e0e0e] backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="flex items-start justify-between p-6 pb-4 border-b border-white/5 shrink-0">
                                <div>
                                <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                                    {editingId ? t.admin_edit_plan : t.admin_new_plan}
                                </h3>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">
                                        {t.admin_plan_modal_help}
                                    </p>
                                </div>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4 px-6 py-5 overflow-y-auto flex-1 min-h-0">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_plan_name_label}</label>
                                        <input
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder={t.admin_plan_name_placeholder}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_plan_slug_label}</label>
                                        <input
                                            value={form.slug}
                                            onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                                            placeholder={t.admin_plan_slug_placeholder}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_plan_price_label}</label>
                                        <input
                                            type="number"
                                            value={form.price}
                                            onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_plan_coins_label}</label>
                                        <input
                                            type="number"
                                            value={form.coinsAmount}
                                            onChange={e => setForm(f => ({ ...f, coinsAmount: Number(e.target.value) }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_plan_desc_label}</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        rows={2}
                                        placeholder={t.admin_plan_desc_placeholder}
                                        className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide resize-none"
                                    />
                                </div>

                                <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">{t.admin_plan_status_label}</p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        {form.isActive
                                            ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">{t.admin_active}</span></>
                                            : <><ToggleLeft className="w-5 h-5 text-gray-500" /><span className="text-gray-500">{t.admin_inactive}</span></>
                                        }
                                    </button>
                                </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 p-6 pt-4 border-t border-white/5 shrink-0">
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-white/10 transition-all"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    onClick={() => setPendingAction({
                                        type: "save",
                                        planId: editingId || undefined,
                                        planName: form.name || t.plans
                                    })}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {editingId ? t.admin_update : t.admin_create}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
                <DialogContent className={`max-w-md text-white rounded-2xl ${
                    pendingAction?.type === "delete"
                        ? "border-red-500/20 bg-[#12090a]"
                        : pendingAction?.type === "toggle" && pendingAction?.nextActive
                            ? "border-emerald-500/20 bg-[#09120d]"
                            : pendingAction?.type === "toggle"
                                ? "border-amber-500/20 bg-[#120f09]"
                                : "border-sky-500/20 bg-[#0b1016]"
                }`}>
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {pendingAction?.type === "delete"
                                ? t.admin_confirm_delete_plan_title
                                : pendingAction?.type === "toggle"
                                    ? (pendingAction?.nextActive ? t.admin_confirm_activate_plan_title : t.admin_confirm_deactivate_plan_title)
                                    : (editingId ? t.admin_confirm_update_plan_title : t.admin_confirm_create_plan_title)}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {pendingAction?.type === "delete"
                                ? `${t.admin_confirm_delete_plan_desc} ${pendingAction.planName}.`
                                : pendingAction?.type === "toggle"
                                    ? `${pendingAction?.nextActive ? t.admin_confirm_activate_plan_desc : t.admin_confirm_deactivate_plan_desc} ${pendingAction.planName}.`
                                    : `${editingId ? t.admin_confirm_update_plan_desc : t.admin_confirm_create_plan_desc} ${pendingAction?.planName}.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPendingAction(null)}>
                            {t.cancel}
                        </Button>
                        <Button
                            onClick={runPendingAction}
                            className={pendingAction?.type === "delete"
                                ? "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-white"
                                : pendingAction?.type === "toggle" && pendingAction?.nextActive
                                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                    : pendingAction?.type === "toggle"
                                        ? "bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 hover:text-white"
                                        : "bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30 hover:text-white"}
                            disabled={saving || !!deletingId}
                        >
                            {t.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
