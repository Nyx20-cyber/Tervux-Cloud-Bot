"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Bell, Info, AlertTriangle, AlertCircle, CheckCircle, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/store/useAuthStore";
import { formatRelativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { useAuthStore } from "@/store/useAuthStore";

interface Notification {
    _id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "error" | "success";
    isRead: boolean;
    createdAt: string;
}

export default function NotificationsPage() {
    const { language } = useLocaleStore();
    const token = useAuthStore((s) => s.token);
    const t = translations[language];
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "unread">("all");

    const fetchNotifications = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await api.get("/notifications");
            setNotifications(res.data.notifications);
        } catch (error) {
            toast.error(t.failed_load_notifications);
        } finally {
            setIsLoading(false);
        }
    }, [language]);

    useEffect(() => {
        fetchNotifications();

        const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "", {
            auth: { token }
        });

        socket.on("new_notification", (notification: Notification) => {
            setNotifications(prev => [notification, ...prev]);
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchNotifications, token]);

    const markAsRead = async (id: string) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(prev =>
                prev.map(n => n._id === id ? { ...n, isRead: true } : n)
            );
        } catch (error) {
            toast.error(t.failed_mark_read);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put("/notifications/read-all");
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            toast.success(t.all_notifications_marked_read);
        } catch (error) {
            toast.error(t.failed_mark_all);
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            await api.delete(`/notifications/${id}`);
            setNotifications(prev => prev.filter(n => n._id !== id));
            toast.success(t.notification_deleted);
        } catch (error) {
            toast.error(t.failed_delete_notification);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            case "error": return <AlertCircle className="h-5 w-5 text-red-500" />;
            case "success": return <CheckCircle className="h-5 w-5 text-green-500" />;
            default: return <Info className="h-5 w-5 text-blue-500" />;
        }
    };

    const filteredNotifications = notifications.filter(n =>
        filter === "all" ? true : !n.isRead
    );

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-4xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-2.5 sm:gap-3">
                            <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                            {t.notifications_center}
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            {t.notifications_subheading}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {notifications.some(n => !n.isRead) && (
                            <Button
                                onClick={markAllAsRead}
                                variant="outline"
                                className="border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-black uppercase text-[10px] font-black tracking-widest h-10 sm:h-12 px-4 sm:px-6 rounded-xl transition-all"
                            >
                                <Check className="w-4 h-4 mr-2" />
                                {t.mark_all_read}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 sm:gap-3 border-b border-white/5 pb-4 sm:pb-6 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setFilter("all")}
                        className={cn(
                            "px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.2em] transition-all shrink-0",
                            filter === "all"
                                ? "bg-primary text-black shadow-xl shadow-primary/20"
                                : "text-gray-500 hover:text-white hover:bg-white/5"
                        )}
                    >
                        {t.all_activities}
                    </button>
                    <button
                        onClick={() => setFilter("unread")}
                        className={cn(
                            "px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.2em] transition-all flex items-center gap-2 sm:gap-3 shrink-0",
                            filter === "unread"
                                ? "bg-primary text-black shadow-xl shadow-primary/20"
                                : "text-gray-500 hover:text-white hover:bg-white/5"
                        )}
                    >
                        {t.unread}
                        {notifications.filter(n => !n.isRead).length > 0 && (
                            <span className={cn(
                                "h-2 w-2 rounded-full",
                                filter === "unread" ? "bg-black" : "bg-primary animate-pulse"
                            )} />
                        )}
                    </button>
                </div>

                {/* Notifications List */}
                <div className="space-y-4 min-h-[400px]">
                    {isLoading ? (
                        <div className="p-12 sm:p-20 text-center flex flex-col items-center gap-4">
                            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                            <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t.loading_history}</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-10 sm:p-20 border border-white/10 border-dashed rounded-[1.5rem] sm:rounded-[2.5rem] bg-white/[0.02] flex flex-col items-center text-center space-y-4 sm:space-y-5"
                        >
                            <div className="p-8 rounded-full bg-white/5 group hover:bg-primary/5 transition-colors">
                                <Bell className="w-16 h-16 text-gray-800 group-hover:text-primary/40 transition-colors" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-white font-black uppercase tracking-[0.2em] text-sm">{t.all_caught_up}</h3>
                                <p className="text-[11px] text-gray-600 font-bold uppercase tracking-widest max-w-xs">{t.no_notifications}</p>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="space-y-4">
                            <AnimatePresence mode="popLayout">
                                {filteredNotifications.map((n, idx) => (
                                    <motion.div
                                        key={n._id}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className={cn(
                                            "group p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border transition-all duration-300 relative overflow-hidden",
                                            !n.isRead
                                                ? "bg-primary/5 border-primary/20 shadow-xl shadow-primary/5"
                                                : "bg-white/[0.02] border-white/10 hover:border-white/20"
                                        )}
                                    >
                                        <div className="flex items-start gap-3 sm:gap-6 relative z-10">
                                            <div className={cn(
                                                "p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex-shrink-0 transition-all group-hover:scale-110",
                                                !n.isRead ? "bg-primary/20 shadow-lg shadow-primary/10" : "bg-white/5"
                                            )}>
                                                {getIcon(n.type)}
                                            </div>

                                            <div className="flex-1 space-y-1.5 min-w-0">
                                                <div className="flex items-center justify-between gap-4">
                                                    <h3 className={cn(
                                                        "text-[11px] sm:text-[13px] font-black uppercase tracking-widest truncate",
                                                        !n.isRead ? "text-white" : "text-gray-500"
                                                    )}>
                                                        {n.title}
                                                    </h3>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-600 uppercase tracking-widest whitespace-nowrap bg-black/20 px-2 py-0.5 rounded-lg border border-white/5">
                                                        {formatRelativeTime(new Date(n.createdAt), language)}
                                                    </span>
                                                </div>
                                                <p className={cn(
                                                    "text-[10px] sm:text-[12px] font-medium leading-relaxed max-w-2xl",
                                                    !n.isRead ? "text-gray-200" : "text-gray-600"
                                                )}>
                                                    {n.message}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1 sm:gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                {!n.isRead && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-10 w-10 text-primary hover:bg-primary/10 rounded-xl"
                                                        onClick={() => markAsRead(n._id)}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                                    onClick={() => deleteNotification(n._id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
