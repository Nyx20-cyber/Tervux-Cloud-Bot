"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, Smartphone } from "lucide-react";
import { usePWAStore } from "@/store/usePWAStore";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type PermissionState = NotificationPermission | "unsupported" | "unknown";

export default function PWARegistration() {
  const setDeferredPrompt = usePWAStore((state) => state.setDeferredPrompt);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const language = useLocaleStore((state) => state.language);

  const [permissionState, setPermissionState] = useState<PermissionState>("unknown");
  const [showPushModal, setShowPushModal] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const copy = useMemo(() => {
    if (language === "sw") {
      return {
        title: "Washa notifications",
        description: "Kubali notifications ili upate vikumbusho vya kuingia kwenye app, kudeploy bots mpya, na kufanya configurations kwa wakati.",
        enable: "Washa Sasa",
        checking: "Inawasha...",
        grantedTitle: "Umeshakubali notifications",
        deniedTitle: "Notifications zimezuiwa",
        deniedBody: "Browser yako imezuia notifications. Ziwashie kwenye browser settings kisha bonyeza tena hapa chini.",
        benefits: [
          "Deploy reminders za wakati sahihi",
          "Referral na offer updates",
          "Messages za lugha unayopendelea",
        ],
        deniedButton: "Nimeshawasha, Angalia Tena",
        cancel: "Ghairi",
        alertsLabel: "Tervux Alerts",
      };
    }

    return {
      title: "Enable notifications",
      description: "Allow notifications so we can remind you to come back, deploy new bots, and finish your bot configurations on time.",
      enable: "Enable Now",
      checking: "Enabling...",
      grantedTitle: "Notifications already enabled",
      deniedTitle: "Notifications are blocked",
      deniedBody: "Your browser has blocked notifications. Enable them in your browser settings, then tap below to check again.",
      benefits: [
        "Timely deploy reminders",
        "Referral and offer updates",
        "Messages in your preferred language",
      ],
      deniedButton: "I Enabled Them, Check Again",
      cancel: "Cancel",
      alertsLabel: "Tervux Alerts",
    };
  }, [language]);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("SW registered:", reg))
          .catch((err) => console.error("SW error:", err));
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
      }

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener("load", registerSW);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }
  }, [setDeferredPrompt]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user?._id) {
      setShowPushModal(false);
      return;
    }

    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPermissionState("unsupported");
      setShowPushModal(false);
      return;
    }

    const currentPermission = Notification.permission;
    setPermissionState(currentPermission);
    setShowPushModal(currentPermission !== "granted");
  }, [isAuthenticated, hasHydrated, user?._id]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (permissionState !== "granted") return;

    let cancelled = false;

    const registerPush = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          const res = await api.get("/notifications/push/public-key");
          const publicKey = res.data.publicKey;
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        }

        if (!cancelled && subscription) {
          await api.post("/notifications/push/subscribe", {
            subscription: subscription.toJSON()
          });
        }
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 503) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Web push backend is not ready yet. Skipping push subscription for now.");
          }
          return;
        }
        console.error("Push registration failed:", error);
      }
    };

    registerPush();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, hasHydrated, permissionState]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user?._id) return;
    if (user.preferredLanguage === language) return;

    let cancelled = false;

    const syncLanguagePreference = async () => {
      try {
        const res = await api.put("/auth/preferences/language", { language });
        if (!cancelled && res.data?.user) {
          setUser(res.data.user);
        }
      } catch (error) {
        console.error("Failed to sync language preference:", error);
      }
    };

    syncLanguagePreference();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, hasHydrated, user?._id, user?.preferredLanguage, language, setUser]);

  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    setIsSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission === "granted") {
        setShowPushModal(false);
      } else {
        setShowPushModal(true);
      }
    } catch (error) {
      console.error("Notification permission request failed:", error);
      setShowPushModal(true);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleCheckPermissionAgain = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const permission = Notification.permission;
    setPermissionState(permission);
    if (permission === "granted") {
      setShowPushModal(false);
    } else {
      await handleEnableNotifications();
    }
  };

  const handleDismissForNow = () => {
    setShowPushModal(false);
  };

  if (!isAuthenticated || !hasHydrated || permissionState === "unsupported") {
    return null;
  }

  return (
    <>
      <Dialog open={showPushModal} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          className="w-[calc(100vw-1rem)] max-w-md max-h-[90vh] rounded-[1.75rem] sm:rounded-[2rem] border-white/10 bg-[#0d1117]/95 text-white backdrop-blur-3xl p-0 overflow-hidden shadow-2xl shadow-black/40"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(26,115,232,0.16),_transparent_42%)]" />
            <div className="absolute right-6 top-6 h-20 w-20 rounded-full bg-primary/15 blur-2xl animate-pulse" />
            <div className="absolute left-8 top-20 h-14 w-14 rounded-full bg-white/10 blur-xl animate-pulse" />

            <div className="relative max-h-[90vh] overflow-y-auto px-4 pb-4 pt-5 sm:px-6 sm:pb-6 sm:pt-6 custom-scrollbar">
              <DialogHeader className="space-y-4 text-left">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_35px_rgba(26,115,232,0.14)]">
                    <BellRing className="h-6 w-6 sm:h-7 sm:w-7 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-[0.18em] sm:tracking-widest text-white leading-tight">
                      {permissionState === "denied" ? copy.deniedTitle : copy.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-[13px] sm:text-sm leading-relaxed text-gray-300">
                      {permissionState === "denied" ? copy.deniedBody : copy.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-4 sm:mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-3.5 sm:p-4">
                <div className="mb-3 flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-[0.18em] sm:tracking-[0.2em] text-primary">
                  <Smartphone className="h-4 w-4" />
                  {permissionState === "granted" ? copy.grantedTitle : copy.alertsLabel}
                </div>
                <div className="space-y-2.5 sm:space-y-3">
                  {copy.benefits.map((item) => (
                    <div key={item} className="flex items-start gap-3 text-[13px] sm:text-sm text-gray-200 leading-relaxed">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 sm:mt-5 flex flex-col-reverse sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDismissForNow}
                  className="h-11 sm:h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white text-xs sm:text-sm font-black uppercase tracking-[0.16em] sm:tracking-widest"
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  onClick={permissionState === "denied" ? handleCheckPermissionAgain : handleEnableNotifications}
                  disabled={isSubscribing}
                  className="h-11 sm:h-12 w-full rounded-2xl bg-primary text-black hover:bg-primary/90 text-xs sm:text-sm font-black uppercase tracking-[0.16em] sm:tracking-widest shadow-[0_0_35px_rgba(26,115,232,0.18)]"
                >
                  {isSubscribing
                    ? copy.checking
                    : permissionState === "denied"
                      ? copy.deniedButton
                      : copy.enable}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
