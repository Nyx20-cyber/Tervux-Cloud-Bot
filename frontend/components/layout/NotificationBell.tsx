"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Bell, Info, AlertTriangle, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/store/useAuthStore";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { io } from "socket.io-client";
import Link from "next/link";
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
    link?: string;
}

export function NotificationBell() {
    const { language } = useLocaleStore();
    const token = useAuthStore((s) => s.token);
    const forceLocalLogout = useAuthStore((s) => s.forceLocalLogout);
    const t = translations[language];
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = useCallback(async () => {
        if (!token) return;
        try {
            const res = await api.get("/notifications");
            setNotifications(res.data.notifications);
            setUnreadCount(res.data.notifications.filter((n: Notification) => !n.isRead).length);
        } catch (error: any) {
            if (error?.response?.status === 401) {
                forceLocalLogout();
                return;
            }
            if (!(error?.response?.status === 503 && error?.response?.data?.maintenance)) {
                // keep silent for transient auth/route transitions
            }
        }
    }, [token, forceLocalLogout]);

    useEffect(() => {
        if (!token) return;

        queueMicrotask(() => {
            fetchNotifications();
        });

        const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "", {
            auth: { token }
        });

        socket.on("new_notification", (notification: Notification) => {
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
            toast(notification.title, {
                description: notification.message,
                icon: getIcon(notification.type)
            });
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
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            toast.error(t.failed_mark_read);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put("/notifications/read-all");
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
            toast.success(t.all_caught_up);
        } catch (error) {
            toast.error(t.failed_mark_all);
        }
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.delete(`/notifications/${id}`);
            setNotifications(prev => prev.filter(n => n._id !== id));
            // Recalculate unread if needed, but it's easier to just refetch or filter
            setUnreadCount(prev => notifications.find(n => n._id === id && !n.isRead) ? Math.max(0, prev - 1) : prev);
        } catch (error) {
            toast.error(t.failed_delete_notification);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-white hover:bg-white/10 rounded-full h-10 w-10">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-background"></span>
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 bg-[#0f0f0f]/95 backdrop-blur-2xl border-white/10 text-white shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="font-bold text-[11px] uppercase tracking-widest text-gray-400">{t.notifications}</h3>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="text-[10px] uppercase tracking-widest font-bold text-primary hover:text-primary/80 transition-colors"
                        >
                            {t.mark_all_read}
                        </button>
                    )}
                </div>
                <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500">
                            <Bell className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-xs">{t.no_notifications}</p>
                        </div>
                    ) : (
                        notifications.map((n) => (
                            <DropdownMenuItem
                                key={n._id}
                                className={cn(
                                    "flex flex-col items-start gap-1 p-4 cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5 focus:bg-white/5",
                                    !n.isRead && "bg-white/[0.02]"
                                )}
                                onClick={() => markAsRead(n._id)}
                            >
                                <div className="flex items-start justify-between w-full gap-2">
                                    <div className="flex items-center gap-2">
                                        {getIcon(n.type)}
                                        <span className={cn("text-xs font-bold truncate", !n.isRead ? "text-white" : "text-gray-400")}>
                                            {n.title}
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-gray-500 font-medium shrink-0">
                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 leading-relaxed pl-6">
                                    {n.message}
                                </p>
                                <div className="flex justify-end w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-gray-600 hover:text-red-400"
                                        onClick={(e) => deleteNotification(n._id, e)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
                <div className="p-3 border-t border-white/10 text-center">
                    <Link href="/dashboard/notifications" className="block w-full">
                        <Button variant="ghost" className="w-full text-[10px] uppercase tracking-widest font-bold text-gray-500 hover:text-white h-8">
                            {t.view_all}
                        </Button>
                    </Link>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
    function getIcon(type: string) {
        switch (type) {
            case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            case "error": return <AlertCircle className="h-4 w-4 text-red-500" />;
            case "success": return <CheckCircle className="h-4 w-4 text-green-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    }
