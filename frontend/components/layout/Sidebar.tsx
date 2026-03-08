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
            <div className="p-6">
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-3 uppercase">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    {t.app_name}
                </h2>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1 italic opacity-70">
                    {t.securely_connected}
                </p>
            </div>

            <nav className="flex-1 px-4 space-y-2 mt-4">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group border",
                                isActive
                                    ? "bg-primary border-primary text-black shadow-lg shadow-primary/20"
                                    : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:border-white/10 hover:text-white"
                            )}
                        >
                            <Icon className={cn("w-4 h-4", isActive ? "text-black" : "text-gray-500 group-hover:text-primary transition-colors")} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{link.label}</span>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 mt-auto">
                <div className="p-6 rounded-[2rem] border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-2 backdrop-blur-md">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
                        <Activity className="h-5 w-5 text-primary relative z-10" />
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
