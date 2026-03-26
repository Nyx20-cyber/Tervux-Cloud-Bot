"use client";

import { Users, Network, CreditCard, Wifi, ShieldCheck, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";

interface AdminStatsProps {
    stats: {
        totalUsers: number;
        activeSubscriptions: number;
        totalSessions: number;
        activeSessions: number;
        liveConnections: number;
        totalRevenue: number;
        accountBalance?: number | null;
        accountBalanceLive?: boolean;
        currency: string;
    } | null;
}

const getCards = (t: any) => [
    {
        key: "totalUsers",
        label: t.total_users,
        icon: Users,
        gradient: "from-violet-500/20 to-violet-600/5",
        border: "border-violet-500/30",
        text: "text-violet-400",
        iconColor: "text-violet-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "activeSubscriptions",
        label: t.active_subs,
        icon: ShieldCheck,
        gradient: "from-emerald-500/20 to-emerald-600/5",
        border: "border-emerald-500/30",
        text: "text-emerald-400",
        iconColor: "text-emerald-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "activeSessions",
        label: t.active_sessions,
        icon: Network,
        gradient: "from-sky-500/20 to-sky-600/5",
        border: "border-sky-500/30",
        text: "text-sky-400",
        iconColor: "text-sky-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "liveConnections",
        label: t.live_now,
        icon: Wifi,
        gradient: "from-amber-500/20 to-amber-600/5",
        border: "border-amber-500/30",
        text: "text-amber-400",
        iconColor: "text-amber-400",
        format: (v: number) => v.toLocaleString(),
        pulse: true,
    },
    {
        key: "totalSessions",
        label: t.total_devices,
        icon: Zap,
        gradient: "from-pink-500/20 to-pink-600/5",
        border: "border-pink-500/30",
        text: "text-pink-400",
        iconColor: "text-pink-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "accountBalance",
        label: t.admin_fastlipa_total,
        icon: CreditCard,
        gradient: "from-primary/20 to-primary/5",
        border: "border-primary/30",
        text: "text-primary",
        iconColor: "text-primary",
        format: (v: number | null | undefined) => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString()} TZS` : "N/A",
    },
];

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 20 } },
};

export function AdminStats({ stats }: AdminStatsProps) {
    const { language } = useLocaleStore();
    const t = translations[language];
    const cards = getCards(t);

    if (!stats) return null;

    return (
        <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {cards.map((card) => {
                const Icon = card.icon;
                const value = Object.prototype.hasOwnProperty.call(stats, card.key) ? (stats as any)[card.key] : 0;
                return (
                    <motion.div
                        key={card.key}
                        variants={cardVariants}
                        whileHover={{ scale: 1.04, y: -4 }}
                        className={`relative p-3 sm:p-4 rounded-xl sm:rounded-2xl border ${card.border} bg-gradient-to-br ${card.gradient} backdrop-blur-xl flex flex-col items-center text-center space-y-1.5 sm:space-y-2 cursor-default overflow-hidden group transition-shadow hover:shadow-lg hover:shadow-black/20`}
                    >
                        {/* Glow effect */}
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${card.gradient} blur-xl -z-10`} />

                        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${card.iconColor} ${card.pulse ? "animate-pulse" : ""}`} />
                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-500 opacity-70">
                            {card.label}
                        </p>
                        <p className={`text-xs sm:text-sm font-black tracking-widest ${card.text}`}>
                            {card.format(value)}
                        </p>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
