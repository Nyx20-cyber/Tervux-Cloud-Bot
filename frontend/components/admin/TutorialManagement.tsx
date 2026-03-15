"use client";

import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { BookOpenText, ExternalLink, Eye, EyeOff, GraduationCap, Loader2, Pencil, Plus, Save, Trash2, Video } from "lucide-react";

interface TutorialRecord {
    _id: string;
    title: string;
    description: string;
    youtubeUrl: string;
    youtubeVideoId: string;
    isActive: boolean;
    createdAt: string;
    createdBy?: {
        name?: string;
        email?: string;
    };
}

const emptyForm = {
    title: "",
    description: "",
    youtubeUrl: "",
    isActive: true
};

const getErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === "object" && error && "response" in error) {
        const response = (error as { response?: { data?: { error?: string } } }).response;
        if (response?.data?.error) return response.data.error;
    }
    return fallback;
};

const upsertTutorial = (items: TutorialRecord[], tutorial: TutorialRecord) => {
    return [tutorial, ...items.filter((item) => item._id !== tutorial._id)];
};

export function TutorialManagement() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [tutorials, setTutorials] = useState<TutorialRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [pendingAction, setPendingAction] = useState<{
        type: "save" | "delete" | "toggle";
        tutorialId?: string;
        tutorialTitle: string;
        nextActive?: boolean;
    } | null>(null);

    useEffect(() => {
        const fetchTutorials = async () => {
            try {
                setIsLoading(true);
                const res = await api.get("/admin/tutorials");
                setTutorials(res.data.tutorials || []);
            } catch (error: unknown) {
                toast.error(getErrorMessage(error, t.admin_failed_load_tutorials));
            } finally {
                setIsLoading(false);
            }
        };

        fetchTutorials();
    }, [t.admin_failed_load_tutorials]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_tutorial_created", (payload: { tutorial?: TutorialRecord }) => {
            if (!payload?.tutorial?._id) return;
            setTutorials(prev => upsertTutorial(prev, payload.tutorial!));
        });

        socket.on("admin_tutorial_updated", (payload: { tutorial?: TutorialRecord }) => {
            if (!payload?.tutorial?._id) return;
            setTutorials(prev => upsertTutorial(prev, payload.tutorial!));
        });

        socket.on("admin_tutorial_deleted", (payload: { tutorialId?: string }) => {
            if (!payload?.tutorialId) return;
            setTutorials(prev => prev.filter(item => item._id !== payload.tutorialId));
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm });
        setShowForm(true);
    };

    const openEdit = (tutorial: TutorialRecord) => {
        setEditingId(tutorial._id);
        setForm({
            title: tutorial.title,
            description: tutorial.description || "",
            youtubeUrl: tutorial.youtubeUrl,
            isActive: tutorial.isActive
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.title.trim() || !form.youtubeUrl.trim()) {
            toast.error(t.admin_tutorial_required_fields);
            return;
        }

        setSaving(true);
        try {
            if (editingId) {
                const res = await api.put(`/admin/tutorials/${editingId}`, form);
                setTutorials(prev => upsertTutorial(prev, res.data.tutorial));
                toast.success(t.admin_tutorial_updated);
            } else {
                const res = await api.post("/admin/tutorials", form);
                setTutorials(prev => upsertTutorial(prev, res.data.tutorial));
                toast.success(t.admin_tutorial_created);
            }
            setShowForm(false);
            setEditingId(null);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, t.admin_failed_save_tutorial));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (tutorialId: string) => {
        try {
            await api.delete(`/admin/tutorials/${tutorialId}`);
            setTutorials(prev => prev.filter(item => item._id !== tutorialId));
            toast.success(t.admin_tutorial_deleted);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, t.admin_failed_delete_tutorial));
        }
    };

    const toggleActive = async (tutorialId: string, nextActive: boolean) => {
        try {
            const res = await api.put(`/admin/tutorials/${tutorialId}`, { isActive: nextActive });
            setTutorials(prev => upsertTutorial(prev, res.data.tutorial));
            toast.success(nextActive ? t.admin_tutorial_published : t.admin_tutorial_hidden);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, t.admin_failed_toggle_tutorial));
        }
    };

    const runPendingAction = async () => {
        if (!pendingAction) return;

        if (pendingAction.type === "save") {
            await handleSave();
        }
        if (pendingAction.type === "delete" && pendingAction.tutorialId) {
            await handleDelete(pendingAction.tutorialId);
        }
        if (pendingAction.type === "toggle" && pendingAction.tutorialId) {
            await toggleActive(pendingAction.tutorialId, !!pendingAction.nextActive);
        }

        setPendingAction(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-cyan-400" />
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white uppercase">{t.tutorials}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {tutorials.length}
                    </span>
                </div>
                <Button
                    onClick={openCreate}
                    className="w-full sm:w-auto justify-center h-11 rounded-2xl bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 text-[10px] font-black uppercase tracking-widest"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    {t.admin_new_tutorial}
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : tutorials.length === 0 ? (
                <div className="p-10 text-center border border-white/10 border-dashed rounded-3xl bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{t.admin_no_tutorials_yet}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <AnimatePresence>
                        {tutorials.map((tutorial) => (
                            <motion.div
                                key={tutorial._id}
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -18 }}
                                className={`rounded-[1.75rem] border p-4 sm:p-5 backdrop-blur-xl transition-all ${tutorial.isActive
                                    ? "border-white/10 bg-white/[0.03]"
                                    : "border-amber-500/20 bg-amber-500/5 opacity-75"
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-28 sm:w-36 rounded-2xl overflow-hidden border border-white/10 bg-black/30 shrink-0 aspect-[9/16]">
                                        <iframe
                                            className="w-full h-full"
                                            src={`https://www.youtube.com/embed/${tutorial.youtubeVideoId}`}
                                            title={tutorial.title}
                                            loading="lazy"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${tutorial.isActive
                                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                                : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                            }`}>
                                                {tutorial.isActive ? t.admin_active : t.admin_hidden}
                                            </span>
                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                                                Shorts
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="text-sm sm:text-base font-black text-white tracking-tight">{tutorial.title}</h3>
                                            <p className="mt-2 text-xs text-gray-400 leading-relaxed line-clamp-4">
                                                {tutorial.description || t.admin_tutorial_no_description}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <a
                                                href={tutorial.youtubeUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-300 hover:text-cyan-200"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                {t.admin_open_youtube}
                                            </a>
                                            <span className="text-[10px] text-gray-600">•</span>
                                            <span className="text-[10px] font-semibold text-gray-500">
                                                {tutorial.createdBy?.name || tutorial.createdBy?.email || t.admin_admin}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 pt-2">
                                            <button
                                                onClick={() => setPendingAction({
                                                    type: "toggle",
                                                    tutorialId: tutorial._id,
                                                    tutorialTitle: tutorial.title,
                                                    nextActive: !tutorial.isActive
                                                })}
                                                className="inline-flex items-center justify-center w-10 h-10 rounded-2xl border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                            >
                                                {tutorial.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => openEdit(tutorial)}
                                                className="inline-flex items-center justify-center w-10 h-10 rounded-2xl border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setPendingAction({
                                                    type: "delete",
                                                    tutorialId: tutorial._id,
                                                    tutorialTitle: tutorial.title
                                                })}
                                                className="inline-flex items-center justify-center w-10 h-10 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:w-full sm:max-w-2xl max-h-[90vh] rounded-2xl sm:rounded-[2rem] border-white/10 bg-[#0d1117] text-white p-0 overflow-hidden flex flex-col">
                    <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-white/5 shrink-0">
                        <DialogTitle className="text-base font-black uppercase tracking-widest">
                            {editingId ? t.admin_edit_tutorial : t.admin_new_tutorial}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-400">
                            {t.admin_tutorial_modal_help}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 overflow-y-auto min-h-0 custom-scrollbar">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.admin_title}</label>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder={t.admin_tutorial_title_placeholder}
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.admin_youtube_link}</label>
                                <input
                                    value={form.youtubeUrl}
                                    onChange={(e) => setForm(prev => ({ ...prev, youtubeUrl: e.target.value }))}
                                    placeholder={t.admin_tutorial_link_placeholder}
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.admin_description}</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    rows={5}
                                    placeholder={t.admin_tutorial_description_placeholder}
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                                />
                            </div>
                            <button
                                onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                                className={`sm:col-span-2 rounded-2xl border px-4 py-3 text-left transition-all ${form.isActive
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Video className="w-4 h-4" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest">{t.admin_tutorial_visibility}</p>
                                        <p className="mt-1 text-xs font-semibold">
                                            {form.isActive ? t.admin_tutorial_visible_desc : t.admin_tutorial_hidden_desc}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                    <DialogFooter className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 border-t border-white/5 shrink-0 flex-col-reverse sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setShowForm(false)}
                            className="w-full sm:w-auto rounded-2xl border-white/10 bg-white/5 text-gray-200"
                        >
                            {t.cancel}
                        </Button>
                        <Button
                            onClick={() => setPendingAction({
                                type: "save",
                                tutorialTitle: form.title || t.admin_tutorial_fallback_title
                            })}
                            className="w-full sm:w-auto rounded-2xl bg-primary text-black hover:bg-primary/90"
                        >
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            {editingId ? t.admin_update : t.admin_create}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
                <AlertDialogContent className="rounded-[2rem] border-white/10 bg-[#0b1016] text-white">
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-primary/15 text-primary border border-primary/20">
                            <BookOpenText className="w-8 h-8" />
                        </AlertDialogMedia>
                        <AlertDialogTitle className="text-base font-black uppercase tracking-widest">
                            {pendingAction?.type === "save"
                                ? editingId ? t.admin_confirm_update_tutorial_title : t.admin_confirm_create_tutorial_title
                                : pendingAction?.type === "delete"
                                    ? t.admin_confirm_delete_tutorial_title
                                    : pendingAction?.nextActive
                                        ? t.admin_confirm_publish_tutorial_title
                                        : t.admin_confirm_hide_tutorial_title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm text-gray-300 leading-relaxed">
                            {pendingAction?.type === "save"
                                ? editingId ? t.admin_confirm_update_tutorial_desc : t.admin_confirm_create_tutorial_desc
                                : pendingAction?.type === "delete"
                                    ? t.admin_confirm_delete_tutorial_desc
                                    : pendingAction?.nextActive
                                        ? t.admin_confirm_publish_tutorial_desc
                                        : t.admin_confirm_hide_tutorial_desc}
                        </AlertDialogDescription>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t.admin_title}</p>
                            <p className="mt-1 text-sm font-semibold text-white">{pendingAction?.tutorialTitle}</p>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-2xl border-white/10 bg-white/5 text-gray-200">{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={runPendingAction}
                            className="rounded-2xl bg-primary text-black hover:bg-primary/90"
                        >
                            {t.confirm}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    );
}
