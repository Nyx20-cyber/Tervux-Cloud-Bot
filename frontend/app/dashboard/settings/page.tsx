"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { toast } from "sonner";
import { motion } from "framer-motion";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LockKeyhole, Mail, ShieldCheck, Signature, UserCog } from "lucide-react";

type PendingAction = "name" | "email" | "password" | null;
type FieldKey =
    | "nameCurrent"
    | "nameNew"
    | "namePassword"
    | "emailCurrent"
    | "emailNew"
    | "emailPassword"
    | "passwordCurrent"
    | "passwordNew"
    | "passwordConfirm";

const getErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === "object" && error && "response" in error) {
        const response = (error as { response?: { data?: { error?: string } } }).response;
        if (response?.data?.error) return response.data.error;
    }
    return fallback;
};

export default function SettingsPage() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { user, setUser } = useAuthStore();
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [saving, setSaving] = useState(false);
    const [unlockedFields, setUnlockedFields] = useState<Record<FieldKey, boolean>>({
        nameCurrent: false,
        nameNew: false,
        namePassword: false,
        emailCurrent: false,
        emailNew: false,
        emailPassword: false,
        passwordCurrent: false,
        passwordNew: false,
        passwordConfirm: false
    });

    const [nameForm, setNameForm] = useState({
        currentName: "",
        newName: "",
        currentPassword: ""
    });
    const [emailForm, setEmailForm] = useState({
        currentEmail: "",
        newEmail: "",
        currentPassword: ""
    });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    const runPendingAction = async () => {
        if (!pendingAction) return;
        setSaving(true);

        try {
            if (pendingAction === "name") {
                const res = await api.put("/auth/account/profile", nameForm);
                setUser(res.data.user);
                setNameForm({
                    currentName: "",
                    newName: "",
                    currentPassword: ""
                });
                toast.success(t.settings_name_updated);
            }

            if (pendingAction === "email") {
                const res = await api.put("/auth/account/email", emailForm);
                setUser(res.data.user);
                setEmailForm({
                    currentEmail: "",
                    newEmail: "",
                    currentPassword: ""
                });
                toast.success(t.settings_email_updated);
            }

            if (pendingAction === "password") {
                if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                    toast.error(t.settings_password_mismatch);
                    setSaving(false);
                    return;
                }
                await api.put("/auth/account/password", {
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword
                });
                setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: ""
                });
                toast.success(t.settings_password_updated);
            }

            setPendingAction(null);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, t.settings_failed_update));
        } finally {
            setSaving(false);
        }
    };

    const canSubmitName = !!nameForm.currentName.trim() && !!nameForm.newName.trim() && !!nameForm.currentPassword.trim();
    const canSubmitEmail = !!emailForm.currentEmail.trim() && !!emailForm.newEmail.trim() && !!emailForm.currentPassword.trim();
    const canSubmitPassword = !!passwordForm.currentPassword.trim() && !!passwordForm.newPassword.trim() && !!passwordForm.confirmPassword.trim();

    const unlockField = (field: FieldKey) => {
        setUnlockedFields((prev) => prev[field] ? prev : { ...prev, [field]: true });
    };

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
                <form className="hidden" autoComplete="on" aria-hidden="true">
                    <input type="email" name="username" autoComplete="username" tabIndex={-1} />
                    <input type="password" name="password" autoComplete="current-password" tabIndex={-1} />
                </form>

                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-500/10 via-white/[0.06] to-white/[0.03] backdrop-blur-2xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-emerald-300">
                                <UserCog className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{t.settings_title}</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-white uppercase tracking-tight">
                                {t.settings_title}
                            </h1>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 max-w-2xl">
                                {t.settings_desc}
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-3 max-w-sm">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">{t.settings_security_notice}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 leading-relaxed">{t.settings_security_notice_desc}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"><Signature className="w-5 h-5" /></div>
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-tight">{t.settings_profile_card_title}</h2>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{t.settings_profile_card_desc}</p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-cyan-500/15 bg-cyan-500/10 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">{t.settings_current_name}</p>
                            <p className="mt-1 text-sm font-semibold text-white break-words">{user?.name || "-"}</p>
                        </div>
                        <div className="mt-5 space-y-3">
                            <Input
                                value={nameForm.currentName}
                                onChange={(e) => setNameForm(prev => ({ ...prev, currentName: e.target.value }))}
                                onFocus={() => unlockField("nameCurrent")}
                                placeholder={t.settings_current_name}
                                autoComplete="off"
                                name="settings_name_current"
                                readOnly={!unlockedFields.nameCurrent}
                                spellCheck={false}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                value={nameForm.newName}
                                onChange={(e) => setNameForm(prev => ({ ...prev, newName: e.target.value }))}
                                onFocus={() => unlockField("nameNew")}
                                placeholder={t.settings_new_name}
                                autoComplete="off"
                                name="settings_name_new"
                                readOnly={!unlockedFields.nameNew}
                                spellCheck={false}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                type="password"
                                value={nameForm.currentPassword}
                                onChange={(e) => setNameForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                onFocus={() => unlockField("namePassword")}
                                placeholder={t.settings_current_password}
                                autoComplete="new-password"
                                name="settings_name_password"
                                readOnly={!unlockedFields.namePassword}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Button disabled={!canSubmitName} onClick={() => setPendingAction("name")} className="w-full h-11 rounded-2xl bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-widest text-[10px]">
                                {t.settings_save_changes}
                            </Button>
                        </div>
                    </motion.section>

                    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <div className="p-3 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300"><Mail className="w-5 h-5" /></div>
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-tight">{t.settings_email_card_title}</h2>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{t.settings_email_card_desc}</p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-violet-500/15 bg-violet-500/10 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">{t.settings_current_email}</p>
                            <p className="mt-1 text-sm font-semibold text-white break-all">{user?.email || "-"}</p>
                        </div>
                        <div className="mt-5 space-y-3">
                            <Input
                                type="email"
                                value={emailForm.currentEmail}
                                onChange={(e) => setEmailForm(prev => ({ ...prev, currentEmail: e.target.value }))}
                                onFocus={() => unlockField("emailCurrent")}
                                placeholder={t.settings_current_email}
                                autoComplete="off"
                                name="settings_email_current"
                                readOnly={!unlockedFields.emailCurrent}
                                spellCheck={false}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                type="email"
                                value={emailForm.newEmail}
                                onChange={(e) => setEmailForm(prev => ({ ...prev, newEmail: e.target.value }))}
                                onFocus={() => unlockField("emailNew")}
                                placeholder={t.settings_new_email}
                                autoComplete="off"
                                name="settings_email_new"
                                readOnly={!unlockedFields.emailNew}
                                spellCheck={false}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                type="password"
                                value={emailForm.currentPassword}
                                onChange={(e) => setEmailForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                onFocus={() => unlockField("emailPassword")}
                                placeholder={t.settings_current_password}
                                autoComplete="new-password"
                                name="settings_email_password"
                                readOnly={!unlockedFields.emailPassword}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Button disabled={!canSubmitEmail} onClick={() => setPendingAction("email")} className="w-full h-11 rounded-2xl bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-widest text-[10px]">
                                {t.settings_save_changes}
                            </Button>
                        </div>
                    </motion.section>

                    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300"><LockKeyhole className="w-5 h-5" /></div>
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-tight">{t.settings_password_card_title}</h2>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{t.settings_password_card_desc}</p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/10 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">{t.settings_current_password}</p>
                            <p className="mt-1 text-sm font-semibold text-white tracking-[0.3em]">••••••••</p>
                        </div>
                        <div className="mt-5 space-y-3">
                            <Input
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                onFocus={() => unlockField("passwordCurrent")}
                                placeholder={t.settings_current_password}
                                autoComplete="new-password"
                                name="settings_password_current"
                                readOnly={!unlockedFields.passwordCurrent}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                onFocus={() => unlockField("passwordNew")}
                                placeholder={t.settings_new_password}
                                autoComplete="new-password"
                                name="settings_password_new"
                                readOnly={!unlockedFields.passwordNew}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Input
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                onFocus={() => unlockField("passwordConfirm")}
                                placeholder={t.settings_confirm_password}
                                autoComplete="new-password"
                                name="settings_password_confirm"
                                readOnly={!unlockedFields.passwordConfirm}
                                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                            />
                            <Button disabled={!canSubmitPassword} onClick={() => setPendingAction("password")} className="w-full h-11 rounded-2xl bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-widest text-[10px]">
                                {t.settings_save_changes}
                            </Button>
                        </div>
                    </motion.section>
                </div>
            </div>

            <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
                <AlertDialogContent className="rounded-[2rem] border-white/10 bg-[#0b1016] text-white">
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-primary/15 text-primary border border-primary/20">
                            <ShieldCheck className="w-8 h-8" />
                        </AlertDialogMedia>
                        <AlertDialogTitle className="text-base font-black uppercase tracking-widest">
                            {pendingAction === "name"
                                ? t.settings_confirm_name_title
                                : pendingAction === "email"
                                    ? t.settings_confirm_email_title
                                    : t.settings_confirm_password_title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm text-gray-300 leading-relaxed">
                            {pendingAction === "name"
                                ? t.settings_confirm_name_desc
                                : pendingAction === "email"
                                    ? t.settings_confirm_email_desc
                                    : t.settings_confirm_password_desc}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-2xl border-white/10 bg-white/5 text-gray-200">{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={runPendingAction} className="rounded-2xl bg-primary text-black hover:bg-primary/90">
                            {saving ? "..." : t.confirm}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
