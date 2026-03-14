"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { motion } from "framer-motion";
import { CircleHelp, Coins, Globe2, LifeBuoy, Link2, MessageCircleQuestion, PlaySquare, Settings2, ShieldCheck, Smartphone, WalletCards } from "lucide-react";

export default function HelpCenterPage() {
    const { language } = useLocaleStore();
    const t = translations[language];

    const faqs = [
        { icon: CircleHelp, q: t.help_center_q1, a: t.help_center_a1 },
        { icon: MessageCircleQuestion, q: t.help_center_q2, a: t.help_center_a2 },
        { icon: WalletCards, q: t.help_center_q3, a: t.help_center_a3 },
        { icon: ShieldCheck, q: t.help_center_q4, a: t.help_center_a4 },
        { icon: LifeBuoy, q: t.help_center_q5, a: t.help_center_a5 },
        { icon: Link2, q: t.help_center_q6, a: t.help_center_a6 },
        { icon: Coins, q: t.help_center_q7, a: t.help_center_a7 },
        { icon: Smartphone, q: t.help_center_q8, a: t.help_center_a8 },
        { icon: ShieldCheck, q: t.help_center_q9, a: t.help_center_a9 },
        { icon: Settings2, q: t.help_center_q10, a: t.help_center_a10 },
        { icon: PlaySquare, q: t.help_center_q11, a: t.help_center_a11 },
        { icon: Globe2, q: t.help_center_q12, a: t.help_center_a12 }
    ];

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-sky-500/10 via-white/[0.06] to-white/[0.03] backdrop-blur-2xl p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300">
                            <CircleHelp className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-white uppercase tracking-tight">{t.help_center_title}</h1>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 max-w-2xl">{t.help_center_desc}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {faqs.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <motion.article
                                key={item.q}
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-6"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-tight">{item.q}</h2>
                                        <p className="mt-3 text-sm leading-relaxed text-gray-400">{item.a}</p>
                                    </div>
                                </div>
                            </motion.article>
                        );
                    })}
                </div>
            </div>
        </DashboardLayout>
    );
}
