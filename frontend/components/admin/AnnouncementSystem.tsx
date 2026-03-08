"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Megaphone, Plus, Pencil, Trash2, X, Save, Loader2,
    ToggleLeft, ToggleRight, Info, AlertTriangle, Wrench, Sparkles, Tag
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

interface AnnouncementRecord {
    _id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "maintenance" | "update" | "promo";
    isActive: boolean;
    createdBy?: { name?: string; email?: string };
    createdAt: string;
}

const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: "text-sky-400", bg: "bg-sky-500/20", border: "border-sky-500/30" },
    warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30" },
    maintenance: { icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/30" },
    update: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/20", border: "border-violet-500/30" },
    promo: { icon: Tag, color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
};

const types = ["info", "warning", "maintenance", "update", "promo"] as const;

const emptyForm = { title: "", message: "", type: "info" as string, isActive: true };

export function AnnouncementSystem() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const typeLabel = (type: string) => (t[`admin_announcement_type_${type}` as keyof typeof t] as string) || type;
    const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchAnnouncements = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/announcements");
            setAnnouncements(res.data.announcements);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm });
        setShowForm(true);
    };

    const openEdit = (a: AnnouncementRecord) => {
        setEditingId(a._id);
        setForm({ title: a.title, message: a.message, type: a.type, isActive: a.isActive });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.title || !form.message) {
            toast.error(t.admin_title_message_required);
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                const res = await api.put(`/admin/announcements/${editingId}`, form);
                setAnnouncements(prev => prev.map(a => a._id === editingId ? res.data.announcement : a));
                toast.success(t.admin_announcement_updated);
            } else {
                const res = await api.post("/admin/announcements", form);
                setAnnouncements(prev => [res.data.announcement, ...prev]);
                toast.success(t.admin_announcement_created);
            }
            setShowForm(false);
            setEditingId(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_save);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/admin/announcements/${id}`);
            setAnnouncements(prev => prev.filter(a => a._id !== id));
            toast.success(t.admin_announcement_deleted);
        } catch {
            toast.error(t.admin_failed_delete);
        } finally {
            setDeletingId(null);
        }
    };

    const toggleActive = async (a: AnnouncementRecord) => {
        try {
            const res = await api.put(`/admin/announcements/${a._id}`, { isActive: !a.isActive });
            setAnnouncements(prev => prev.map(x => x._id === a._id ? res.data.announcement : x));
            toast.success(a.isActive ? t.admin_announcement_hidden : t.admin_announcement_published);
        } catch {
            toast.error(t.admin_failed_toggle);
        }
    };

    const activeCount = announcements.filter(a => a.isActive).length;

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
                    <Megaphone className="h-5 w-5 text-orange-400" />
                    <h2 className="text-lg font-semibold tracking-tight text-white uppercase">{t.announcements}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        {activeCount} {t.admin_active}
                    </span>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t.admin_new_announcement}
                </button>
            </div>

            {/* Announcement list */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : announcements.length === 0 ? (
                <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{t.admin_no_announcements_yet}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {announcements.map(a => {
                            const tc = typeConfig[a.type] || typeConfig.info;
                            const Icon = tc.icon;
                            return (
                                <motion.div
                                    key={a._id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className={`rounded-2xl border backdrop-blur-xl p-5 transition-all group ${a.isActive
                                        ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                        : "border-white/5 bg-white/[0.01] opacity-50"
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Type icon */}
                                        <div className={`p-2.5 rounded-xl ${tc.bg} border ${tc.border} shrink-0`}>
                                            <Icon className={`w-4 h-4 ${tc.color}`} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${tc.bg} ${tc.color} border ${tc.border}`}>
                                                    {typeLabel(a.type)}
                                                </span>
                                                {!a.isActive && (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-gray-500/20 text-gray-500 border border-gray-500/30">
                                                        {t.admin_hidden}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="text-sm font-bold text-white tracking-wide mb-1">{a.title}</h3>
                                            <p className="text-xs text-gray-400 font-medium leading-relaxed line-clamp-3">{a.message}</p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-[9px] font-semibold text-gray-600 tracking-widest">
                                                    {format(new Date(a.createdAt), "MMM dd, yyyy HH:mm")}
                                                </span>
                                                <span className="text-[9px] font-semibold text-gray-600">·</span>
                                                <span className="text-[9px] font-semibold text-gray-600 tracking-widest">
                                                    {t.admin_by} {a.createdBy?.name || a.createdBy?.email || t.admin_admin}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button
                                                onClick={() => toggleActive(a)}
                                                title={a.isActive ? t.admin_hide : t.admin_publish}
                                                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                                            >
                                                {a.isActive
                                                    ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                                                    : <ToggleLeft className="w-4 h-4 text-gray-500" />
                                                }
                                            </button>
                                            <button
                                                onClick={() => openEdit(a)}
                                                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(a._id)}
                                                disabled={deletingId === a._id}
                                                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all text-red-400"
                                            >
                                                {deletingId === a._id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-3.5 h-3.5" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
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
                            <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5 shrink-0">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                                    {editingId ? t.admin_edit_announcement : t.admin_new_announcement}
                                </h3>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4 px-6 py-5 overflow-y-auto flex-1 min-h-0">
                                {/* Type selector */}
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2 block">{t.admin_type}</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {types.map(t => {
                                            const tc = typeConfig[t];
                                            const Icon = tc.icon;
                                            return (
                                                <button
                                                    key={t}
                                                    onClick={() => setForm(f => ({ ...f, type: t }))}
                                                    className={`flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all min-w-0 ${form.type === t
                                                        ? `${tc.bg} ${tc.color} border ${tc.border}`
                                                        : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
                                                        }`}
                                                >
                                                    <Icon className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{typeLabel(t)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Title */}
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_title}</label>
                                    <input
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        placeholder={t.admin_scheduled_maintenance}
                                        className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide"
                                    />
                                </div>

                                {/* Message */}
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_message}</label>
                                    <textarea
                                        value={form.message}
                                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                        rows={4}
                                        placeholder={t.admin_announcement_message_placeholder}
                                        className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-wide resize-none"
                                    />
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
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {editingId ? t.admin_update : t.admin_publish}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
