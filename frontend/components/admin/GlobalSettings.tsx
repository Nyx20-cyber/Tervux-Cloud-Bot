"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/store/useAuthStore";
import {
    Settings, Save, Loader2, ShieldAlert,
    UserPlus, Phone, Globe, Lock, Unlock
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export function GlobalSettings() {
    const [settings, setSettings] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get("/admin/settings");
            setSettings(res.data.settings);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load settings");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put("/admin/settings", settings);
            toast.success("Settings updated successfully");
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to save settings");
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
            className="grid gap-6 md:grid-cols-2"
        >
            {/* General Settings */}
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/20 border border-primary/30">
                        <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Platform Identity</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Brand and support info</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Site Name</label>
                        <input
                            value={settings?.siteName}
                            onChange={e => setSettings({ ...settings, siteName: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Support Phone Number</label>
                        <input
                            value={settings?.supportPhone}
                            onChange={e => setSettings({ ...settings, supportPhone: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                </div>
            </div>

            {/* Access Controls */}
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/30">
                        <ShieldAlert className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Access Controls</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Global platform toggles</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Maintenance Mode */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 transition-all hover:bg-black/30">
                        <div className="flex items-center gap-3">
                            {settings?.maintenanceMode ? <Lock className="w-4 h-4 text-orange-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">Maintenance Mode</p>
                                <p className="text-[8px] font-bold text-gray-600 uppercase">Restrict access to admins only</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
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
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">Public Registration</p>
                                <p className="text-[8px] font-bold text-gray-600 uppercase">Allow new users to sign up</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSettings({ ...settings, registrationEnabled: !settings.registrationEnabled })}
                            className={`w-10 h-5 rounded-full transition-all relative ${settings?.registrationEnabled ? 'bg-emerald-500/40' : 'bg-destructive/20'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${settings?.registrationEnabled ? 'right-1 bg-emerald-400' : 'left-1 bg-destructive'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Rewards & Incentives */}
            <div className="p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30">
                        <Settings className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Rewards & Incentives</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Coin-based prize configurations</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Weekly King Bonus (Coins)</label>
                        <input
                            type="number"
                            value={settings?.kingBonusCoins}
                            onChange={e => setSettings({ ...settings, kingBonusCoins: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Referral Bonus (Coins/Purchase)</label>
                        <input
                            type="number"
                            value={settings?.referralBonus}
                            onChange={e => setSettings({ ...settings, referralBonus: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-black/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest"
                        />
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                        <p className="text-[9px] font-bold text-yellow-500/70 uppercase leading-relaxed">
                            💡 Changing these values will automatically notify all users about the new reward structure.
                        </p>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="md:col-span-2 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/30 transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All Settings
                </button>
            </div>
        </motion.div>
    );
}
