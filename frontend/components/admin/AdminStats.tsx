"use client";

import { Users, Network, CreditCard, Wifi, ShieldCheck, Zap } from "lucide-react";
import { motion } from "framer-motion";

interface AdminStatsProps {
    stats: {
        totalUsers: number;
        activeSubscriptions: number;
        totalSessions: number;
        activeSessions: number;
        liveConnections: number;
        totalRevenue: number;
        currency: string;
    } | null;
}

const cards = [
    {
        key: "totalUsers",
        label: "Total Users",
        icon: Users,
        gradient: "from-violet-500/20 to-violet-600/5",
        border: "border-violet-500/30",
        text: "text-violet-400",
        iconColor: "text-violet-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "activeSubscriptions",
        label: "Active Subs",
        icon: ShieldCheck,
        gradient: "from-emerald-500/20 to-emerald-600/5",
        border: "border-emerald-500/30",
        text: "text-emerald-400",
        iconColor: "text-emerald-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "activeSessions",
        label: "Active Sessions",
        icon: Network,
        gradient: "from-sky-500/20 to-sky-600/5",
        border: "border-sky-500/30",
        text: "text-sky-400",
        iconColor: "text-sky-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "liveConnections",
        label: "Live Now",
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
        label: "Total Devices",
        icon: Zap,
        gradient: "from-pink-500/20 to-pink-600/5",
        border: "border-pink-500/30",
        text: "text-pink-400",
        iconColor: "text-pink-400",
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: "totalRevenue",
        label: "Revenue (All)",
        icon: CreditCard,
        gradient: "from-primary/20 to-primary/5",
        border: "border-primary/30",
        text: "text-primary",
        iconColor: "text-primary",
        format: (v: number) => `${v.toLocaleString()} TZS`,
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
    if (!stats) return null;

    return (
        <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {cards.map((card) => {
                const Icon = card.icon;
                const value = (stats as any)[card.key] ?? 0;
                return (
                    <motion.div
                        key={card.key}
                        variants={cardVariants}
                        whileHover={{ scale: 1.04, y: -4 }}
                        className={`relative p-4 rounded-2xl border ${card.border} bg-gradient-to-br ${card.gradient} backdrop-blur-xl flex flex-col items-center text-center space-y-2 cursor-default overflow-hidden group transition-shadow hover:shadow-lg hover:shadow-black/20`}
                    >
                        {/* Glow effect */}
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${card.gradient} blur-xl -z-10`} />

                        <Icon className={`h-5 w-5 ${card.iconColor} ${card.pulse ? "animate-pulse" : ""}`} />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">
                            {card.label}
                        </p>
                        <p className={`text-sm font-black tracking-widest ${card.text}`}>
                            {card.format(value)}
                        </p>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
