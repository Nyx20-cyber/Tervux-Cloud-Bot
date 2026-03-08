"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, CircleDollarSign, AlertTriangle, Users, LayoutDashboard, Activity, Settings2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

export function Sidebar({ isMobile }: { isMobile?: boolean }) {
    const pathname = usePathname();
    const { user } = useAuthStore();
    const { language } = useLocaleStore();
    const t = translations[language];
    const compact = !!isMobile;

    const links = [
        { href: '/dashboard', label: t.dashboard, icon: LayoutDashboard },
        { href: '/dashboard/pair', label: t.pair, icon: Network },
        { href: '/dashboard/configurations', label: t.configurations, icon: Settings2 },
        { href: '/dashboard/deployments', label: t.deployments, icon: ShieldCheck },
        { href: '/dashboard/referrals', label: t.referrals, icon: Users },
        { href: '/dashboard/notifications', label: t.notifications, icon: Activity },
        { href: '/dashboard/billing', label: t.billing, icon: CircleDollarSign },
        ...(user?.role === 'admin' ? [{ href: '/admin', label: t.admin_panel, icon: AlertTriangle }] : []),
    ];

    const content = (
        <div className="flex flex-col h-full w-full">
            <div className={cn(compact ? "p-4" : "p-6")}>
                <h2 className={cn("font-black tracking-tight text-white flex items-center gap-2.5 uppercase", compact ? "text-base" : "text-xl")}>
                    <ShieldCheck className={cn("text-primary", compact ? "h-4 w-4" : "h-5 w-5")} />
                    {t.app_name}
                </h2>
                <p className={cn("font-bold text-gray-500 uppercase tracking-widest mt-1 italic opacity-70", compact ? "text-[9px]" : "text-[10px]")}>
                    {t.securely_connected}
                </p>
            </div>

            <nav className={cn("flex-1 space-y-2", compact ? "px-3 mt-2" : "px-4 mt-4")}>
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex items-center gap-3 rounded-2xl transition-all duration-300 group border",
                                compact ? "px-3 py-2.5" : "px-4 py-3",
                                isActive
                                    ? "bg-primary border-primary text-black shadow-lg shadow-primary/20"
                                    : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:border-white/10 hover:text-white"
                            )}
                        >
                            <Icon className={cn("w-4 h-4", isActive ? "text-black" : "text-gray-500 group-hover:text-primary transition-colors")} />
                            <span className={cn("font-black uppercase tracking-widest", compact ? "text-[9px]" : "text-[10px]")}>{link.label}</span>
                        </Link>
                    )
                })}
            </nav>

            <div className={cn("mt-auto", compact ? "p-3" : "p-4")}>
                <div className={cn("rounded-[2rem] border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-2 backdrop-blur-md", compact ? "p-4" : "p-6")}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
                        <Activity className={cn("text-primary relative z-10", compact ? "h-4 w-4" : "h-5 w-5")} />
                    </div>
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-primary/50">{t.service_status}</p>
                        <p className="text-[10px] font-black text-primary tracking-[0.2em]">{t.online}</p>
                    </div>
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return content;
    }

    return (
        <aside className="w-68 border-r border-white/5 bg-black/40 backdrop-blur-3xl h-full flex flex-col hidden lg:flex">
            {content}
        </aside>
    );
}
