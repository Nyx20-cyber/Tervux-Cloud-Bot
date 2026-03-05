"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Package, Plus, Pencil, Trash2, X, Save, Loader2, ToggleLeft, ToggleRight, Coins
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface PlanRecord {
    _id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    durationDays: number;
    coinsAmount: number;
    description: string;
    isActive: boolean;
    createdAt: string;
}

const emptyPlan = {
    name: "", slug: "", price: 0, currency: "TZS",
    durationDays: 0, coinsAmount: 0, description: "", isActive: true,
};

export function PlanManagement() {
    const [plans, setPlans] = useState<PlanRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyPlan });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchPlans = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/plans");
            setPlans(res.data.plans);
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch plans");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyPlan });
        setShowForm(true);
    };

    const openEdit = (plan: PlanRecord) => {
        setEditingId(plan._id);
        setForm({
            name: plan.name, slug: plan.slug, price: plan.price,
            currency: plan.currency, durationDays: plan.durationDays,
            coinsAmount: plan.coinsAmount, description: plan.description,
            isActive: plan.isActive,
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.slug || form.price === undefined) {
            toast.error("Name, slug, and price are required");
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                const res = await api.put(`/admin/plans/${editingId}`, form);
                setPlans(prev => prev.map(p => p._id === editingId ? res.data.plan : p));
                toast.success("Plan updated");
            } else {
                const res = await api.post("/admin/plans", form);
                setPlans(prev => [...prev, res.data.plan]);
                toast.success("Plan created");
            }
            setShowForm(false);
            setEditingId(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to save plan");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/admin/plans/${id}`);
            setPlans(prev => prev.filter(p => p._id !== id));
            toast.success("Plan deleted");
        } catch (err) {
            toast.error("Failed to delete plan");
        } finally {
            setDeletingId(null);
        }
    };

    const toggleActive = async (plan: PlanRecord) => {
        try {
            const res = await api.put(`/admin/plans/${plan._id}`, { isActive: !plan.isActive });
            setPlans(prev => prev.map(p => p._id === plan._id ? res.data.plan : p));
            toast.success(plan.isActive ? "Plan deactivated" : "Plan activated");
        } catch (err) {
            toast.error("Failed to toggle plan");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-sky-400" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Plans</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                        {plans.length}
                    </span>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all"
                >
                    <Plus className="h-3.5 w-3.5" />
                    New Plan
                </button>
            </div>

            {/* Plan Cards Grid */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : plans.length === 0 ? (
                <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">No plans created yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {plans.map(plan => (
                            <motion.div
                                key={plan._id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`relative rounded-2xl border backdrop-blur-xl p-5 space-y-4 transition-all group ${plan.isActive
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
                                        {plan.isActive ? "Active" : "Inactive"}
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
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Coins</span>
                                        <span className="flex items-center gap-1 text-xs font-black text-yellow-500 tracking-widest">
                                            <Coins className="h-3 w-3" />
                                            {plan.coinsAmount}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Duration</span>
                                        <span className="text-xs font-bold text-gray-400 tracking-widest">
                                            {plan.durationDays > 0 ? `${plan.durationDays} days` : "—"}
                                        </span>
                                    </div>
                                    {plan.description && (
                                        <p className="text-[10px] text-gray-500 font-semibold mt-1 line-clamp-2">{plan.description}</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                                    <button
                                        onClick={() => toggleActive(plan)}
                                        title={plan.isActive ? "Deactivate" : "Activate"}
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
                                        onClick={() => handleDelete(plan._id)}
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
                            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0e0e] backdrop-blur-2xl p-6 space-y-5 shadow-2xl"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                                    {editingId ? "Edit Plan" : "New Plan"}
                                </h3>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Name</label>
                                        <input
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="e.g. Siku"
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Slug</label>
                                        <input
                                            value={form.slug}
                                            onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                                            placeholder="e.g. siku"
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Price (TZS)</label>
                                        <input
                                            type="number"
                                            value={form.price}
                                            onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Coins</label>
                                        <input
                                            type="number"
                                            value={form.coinsAmount}
                                            onChange={e => setForm(f => ({ ...f, coinsAmount: Number(e.target.value) }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Days</label>
                                        <input
                                            type="number"
                                            value={form.durationDays}
                                            onChange={e => setForm(f => ({ ...f, durationDays: Number(e.target.value) }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Description</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        rows={2}
                                        placeholder="Optional description..."
                                        className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest resize-none"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        {form.isActive
                                            ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">Active</span></>
                                            : <><ToggleLeft className="w-5 h-5 text-gray-500" /><span className="text-gray-500">Inactive</span></>
                                        }
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-white/10 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {editingId ? "Update" : "Create"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
