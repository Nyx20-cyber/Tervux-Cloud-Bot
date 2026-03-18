"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Settings, Save, Loader2, ShieldAlert,
    UserPlus, Phone, Globe, Lock, Unlock
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function GlobalSettings() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { token } = useAuthStore();
    const [settings, setSettings] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingToggle, setPendingToggle] = useState<{
        key: "maintenanceMode" | "registrationEnabled";
        nextValue: boolean;
    } | null>(null);

    const getToggleDescription = () => {
        if (!pendingToggle) return "";

        if (pendingToggle.key === "maintenanceMode") {
            return pendingToggle.nextValue
                ? t.admin_confirm_toggle_maintenance_on_desc
                : t.admin_confirm_toggle_maintenance_off_desc;
        }

        return pendingToggle.nextValue
            ? t.admin_confirm_toggle_registration_on_desc
            : t.admin_confirm_toggle_registration_off_desc;
    };

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/settings");
            setSettings(res.data.settings);
        } catch (err) {
            console.error(err);
            toast.error(t.admin_failed_load_settings);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("admin_settings_updated", (payload: { settings?: any }) => {
            if (!payload?.settings) return;
            setSettings(payload.settings);
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put("/admin/settings", settings);
            toast.success(t.admin_settings_updated_successfully);
        } catch (err: any) {
            toast.error(err.response?.data?.error || t.admin_failed_save_settings);
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-4 sm:gap-6 md:grid-cols-2"
        >
            {/* General Settings */}
            <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-5 sm:space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/20 border border-primary/30">
                        <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{t.admin_platform_identity}</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.admin_brand_support_info}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_site_name}</label>
                        <input
                            value={settings?.siteName}
                            onChange={e => setSettings({ ...settings, siteName: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_support_phone_number}</label>
                        <input
                            value={settings?.supportPhone}
                            onChange={e => setSettings({ ...settings, supportPhone: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                </div>
            </div>

            {/* Access Controls */}
            <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-5 sm:space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/30">
                        <ShieldAlert className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{t.admin_access_controls}</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.admin_global_platform_toggles}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Maintenance Mode */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 transition-all hover:bg-black/30">
                        <div className="flex items-center gap-3">
                            {settings?.maintenanceMode ? <Lock className="w-4 h-4 text-orange-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">{t.admin_maintenance_mode}</p>
                                <p className="text-[8px] font-bold text-gray-600 uppercase">{t.admin_restrict_access_admin_only}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setPendingToggle({
                                key: "maintenanceMode",
                                nextValue: !settings.maintenanceMode
                            })}
                            className={`w-10 h-5 rounded-full transition-all relative ${settings?.maintenanceMode ? 'bg-orange-500/40' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${settings?.maintenanceMode ? 'right-1 bg-orange-400' : 'left-1 bg-gray-500'}`} />
                        </button>
                    </div>

                    {/* Registration Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 transition-all hover:bg-black/30">
                        <div className="flex items-center gap-3">
                            <UserPlus className={`w-4 h-4 ${settings?.registrationEnabled ? 'text-emerald-400' : 'text-destructive'}`} />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">{t.admin_public_registration}</p>
                                <p className="text-[8px] font-bold text-gray-600 uppercase">{t.admin_allow_new_users_signup}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setPendingToggle({
                                key: "registrationEnabled",
                                nextValue: !settings.registrationEnabled
                            })}
                            className={`w-10 h-5 rounded-full transition-all relative ${settings?.registrationEnabled ? 'bg-emerald-500/40' : 'bg-destructive/20'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${settings?.registrationEnabled ? 'right-1 bg-emerald-400' : 'left-1 bg-destructive'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Rewards & Incentives */}
            <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md space-y-5 sm:space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30">
                        <Settings className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{t.admin_rewards_incentives}</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.admin_coin_prize_configurations}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_weekly_king_bonus_coins}</label>
                        <input
                            type="number"
                            value={settings?.kingBonusCoins}
                            onChange={e => setSettings({ ...settings, kingBonusCoins: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">{t.admin_referral_bonus_coins_purchase}</label>
                        <input
                            type="number"
                            value={settings?.referralBonus}
                            onChange={e => setSettings({ ...settings, referralBonus: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                        <p className="text-[9px] font-bold text-yellow-500/70 uppercase leading-relaxed">
                            {t.admin_rewards_change_notice}
                        </p>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="md:col-span-2 flex justify-end">
                <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={saving}
                    className="w-full sm:w-auto justify-center flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t.admin_save_all_settings}
                </button>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-w-md border-sky-500/20 bg-[#0b1016] text-white rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_confirm_settings_update_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {t.admin_confirm_settings_update_desc}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                            {t.cancel}
                        </Button>
                        <Button
                            className="bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30 hover:text-white"
                            onClick={async () => {
                                setConfirmOpen(false);
                                await handleSave();
                            }}
                            disabled={saving}
                        >
                            {t.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
                <DialogContent className={`max-w-md text-white rounded-2xl ${
                    pendingToggle?.nextValue
                        ? "border-emerald-500/20 bg-[#09120d]"
                        : "border-amber-500/20 bg-[#120f09]"
                }`}>
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {t.admin_confirm_toggle_title}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-gray-300 leading-relaxed">
                            {getToggleDescription()}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPendingToggle(null)}>
                            {t.cancel}
                        </Button>
                        <Button
                            className={pendingToggle?.nextValue
                                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                                : "bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 hover:text-white"}
                            onClick={() => {
                                if (!pendingToggle) return;
                                setSettings({
                                    ...settings,
                                    [pendingToggle.key]: pendingToggle.nextValue
                                });
                                setPendingToggle(null);
                            }}
                        >
                            {t.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
