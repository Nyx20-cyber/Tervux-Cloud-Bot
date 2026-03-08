"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/store/useAuthStore";
import { AlertTriangle, Loader2, Sparkles, Wrench, ShieldCheck, Clock3 } from "lucide-react";
import { io } from "socket.io-client";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const { logout, token } = useAuthStore();
  const { language, setLanguage } = useLocaleStore();
  const t = translations[language];

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const res = await api.get("/config", { params: { _t: Date.now() } });
        const maintenance = !!res.data?.maintenanceMode;
        setMaintenanceMode(maintenance);
        if (!maintenance) {
          router.replace("/dashboard");
        }
      } catch {
        router.replace("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };
    checkConfig();

    const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      path: "/socket.io"
    });

    socket.on("platform_settings_updated", (payload: { maintenanceMode?: boolean }) => {
      if (typeof payload?.maintenanceMode !== "boolean") return;
      setMaintenanceMode(payload.maintenanceMode);
      if (!payload.maintenanceMode) {
        router.replace("/dashboard");
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!maintenanceMode) return null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070a] text-white flex items-center justify-center p-6">
      <div className="absolute top-6 left-6 z-20">
        {token ? (
          <Button
            onClick={() => logout()}
            variant="ghost"
            size="sm"
            className="h-10 px-4 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 uppercase tracking-widest text-[10px] font-black"
          >
            {t.logout}
          </Button>
        ) : null}
      </div>

      <div className="absolute top-6 right-6 z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "sw" : "en")}
          className="h-10 px-4 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 uppercase tracking-widest text-[10px] font-black"
        >
          <span className="mr-2 text-base">{language === "en" ? "🇺🇸" : "🇹🇿"}</span>
          {language === "en" ? t.english : t.swahili}
        </Button>
      </div>

      <motion.div
        animate={{ opacity: [0.45, 0.75, 0.45], scale: [1, 1.06, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-orange-500/20 blur-[120px]"
      />
      <motion.div
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        className="absolute -bottom-24 -right-20 w-[24rem] h-[24rem] rounded-full bg-cyan-500/20 blur-[110px]"
      />

      <div className="w-full max-w-2xl rounded-3xl border border-orange-400/25 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-2xl p-8 sm:p-10 space-y-6 shadow-2xl shadow-orange-500/10 relative z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-400/35">
            <AlertTriangle className="w-4 h-4 text-orange-300 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-200">
              {t.maintenance_notice_badge}
            </span>
          </div>
          <motion.div
            animate={{ y: [0, -4, 0], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="text-cyan-300"
          >
            <Sparkles className="w-4 h-4" />
          </motion.div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wide leading-tight">
          {t.maintenance_title}
        </h1>

        <p className="text-sm text-gray-200/90 leading-relaxed">
          {t.maintenance_message}
        </p>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center gap-2 text-orange-300">
              <Wrench className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.maintenance_card_work_title}</span>
            </div>
            <p className="mt-2 text-[11px] text-gray-300">{t.maintenance_card_work_desc}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center gap-2 text-cyan-300">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.maintenance_card_safety_title}</span>
            </div>
            <p className="mt-2 text-[11px] text-gray-300">{t.maintenance_card_safety_desc}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <Clock3 className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.maintenance_card_eta_title}</span>
            </div>
            <p className="mt-2 text-[11px] text-gray-300">{t.maintenance_card_eta_desc}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
