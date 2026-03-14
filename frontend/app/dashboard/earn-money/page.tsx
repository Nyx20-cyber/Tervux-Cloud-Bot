"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowRight, Coins, HandCoins, Network, Settings2, ShieldCheck, TrendingUp } from "lucide-react";

export default function EarnMoneyPage() {
    const { language } = useLocaleStore();
    const t = translations[language];

    const steps = [
        { icon: Coins, title: t.earn_money_step1_title, desc: t.earn_money_step1_desc },
        { icon: Network, title: t.earn_money_step2_title, desc: t.earn_money_step2_desc },
        { icon: ShieldCheck, title: t.earn_money_step3_title, desc: t.earn_money_step3_desc },
        { icon: Settings2, title: t.earn_money_step4_title, desc: t.earn_money_step4_desc }
    ];

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-6xl mx-auto">
                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-500/10 via-white/[0.06] to-white/[0.03] backdrop-blur-2xl p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                            <HandCoins className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-white uppercase tracking-tight">{t.earn_money_title}</h1>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 max-w-3xl">{t.earn_money_desc}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5 sm:gap-6">
                    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-6">
                        <h2 className="text-base sm:text-xl font-bold text-white uppercase tracking-tight">{t.earn_money_intro_title}</h2>
                        <p className="mt-3 text-sm text-gray-400 leading-relaxed">{t.earn_money_intro_desc}</p>

                        <div className="mt-6 grid gap-4">
                            {steps.map((step, index) => {
                                const Icon = step.icon;
                                return (
                                    <motion.div
                                        key={step.title}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.06 }}
                                        className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-tight">{step.title}</h3>
                                                    <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                                                </div>
                                                <p className="mt-2 text-sm text-gray-400 leading-relaxed">{step.desc}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </section>

                    <div className="space-y-5">
                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl overflow-hidden">
                            <div className="relative aspect-[4/3]">
                                <Image
                                    src="https://habarileo.co.tz/wp-content/uploads/2025/01/tz2-1.jpg"
                                    alt="Tanzanian money inspiration"
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 1024px) 100vw, 33vw"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/70 via-emerald-900/25 to-black/10" />
                                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-black/65 backdrop-blur-md shadow-lg shadow-black/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-200">
                                        <HandCoins className="w-3.5 h-3.5" />
                                        {t.earn_money_title}
                                    </div>
                                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md px-4 py-3 shadow-lg shadow-black/30">
                                        <p className="text-sm sm:text-base font-black text-white leading-snug">
                                            {t.earn_money_visual_caption}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-2xl p-5 sm:p-6">
                            <div className="flex items-center gap-3 text-emerald-300">
                                <TrendingUp className="w-5 h-5" />
                                <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight">{t.earn_money_example_title}</h2>
                            </div>
                            <p className="mt-3 text-sm text-emerald-100/85 leading-relaxed">{t.earn_money_example_desc}</p>
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                {[
                                    { label: t.earn_money_example_buy_label, value: t.earn_money_example_buy_value },
                                    { label: t.earn_money_example_bot_label, value: t.earn_money_example_bot_value },
                                    { label: t.earn_money_example_profit_label, value: t.earn_money_example_profit_value }
                                ].map((item) => (
                                    <div key={item.label} className="rounded-2xl border border-emerald-400/20 bg-black/20 px-3 py-4 text-center">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300/80">{item.label}</p>
                                        <p className="mt-2 text-sm sm:text-base font-black text-white">{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-amber-500/20 bg-amber-500/10 backdrop-blur-2xl p-5 sm:p-6">
                            <div className="flex items-center gap-3 text-amber-300">
                                <ShieldCheck className="w-5 h-5" />
                                <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight">{t.earn_money_tip_title}</h2>
                            </div>
                            <p className="mt-3 text-sm text-amber-100/85 leading-relaxed">{t.earn_money_tip_desc}</p>
                        </section>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
