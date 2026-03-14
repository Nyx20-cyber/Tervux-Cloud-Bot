"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpenText, ExternalLink, GraduationCap, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

interface TutorialRecord {
    _id: string;
    title: string;
    description: string;
    youtubeUrl: string;
    youtubeVideoId: string;
    createdAt: string;
}

export default function TutorialsPage() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const token = useAuthStore((state) => state.token);
    const [tutorials, setTutorials] = useState<TutorialRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTutorials = async () => {
            try {
                setIsLoading(true);
                const res = await api.get("/tutorials");
                setTutorials(res.data.tutorials || []);
            } catch {
                toast.error(t.failed_load_information);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTutorials();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("tutorials_updated", async () => {
            try {
                const res = await api.get("/tutorials");
                setTutorials(res.data.tutorials || []);
            } catch {
                // Silent refresh failure
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [t.failed_load_information, token]);

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-6xl mx-auto">
                <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/[0.06] to-white/[0.03] backdrop-blur-2xl p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                            <GraduationCap className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-white uppercase tracking-tight">
                                {t.tutorials_title}
                            </h1>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                {t.tutorials_desc}
                            </p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center p-16">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : tutorials.length === 0 ? (
                    <div className="rounded-[2rem] border border-white/10 border-dashed bg-white/[0.03] p-10 text-center space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                            <BookOpenText className="w-8 h-8 text-gray-500" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight text-white">{t.tutorials_empty_title}</h2>
                            <p className="mt-2 text-sm text-gray-400 max-w-xl mx-auto">{t.tutorials_empty_desc}</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                        <AnimatePresence>
                            {tutorials.map((tutorial, index) => (
                                <motion.article
                                    key={tutorial._id}
                                    initial={{ opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -18 }}
                                    transition={{ delay: index * 0.04 }}
                                    className="rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-4 sm:p-5"
                                >
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <div className="w-full sm:w-44 rounded-[1.5rem] overflow-hidden border border-white/10 bg-black/30 aspect-[9/16] shrink-0">
                                            <iframe
                                                className="w-full h-full"
                                                src={`https://www.youtube.com/embed/${tutorial.youtubeVideoId}`}
                                                title={tutorial.title}
                                                loading="lazy"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                                                    <PlayCircle className="w-3.5 h-3.5" />
                                                    Shorts
                                                </span>
                                            </div>
                                            <h2 className="mt-3 text-base sm:text-xl font-bold text-white uppercase tracking-tight">
                                                {tutorial.title}
                                            </h2>
                                            <p className="mt-3 text-sm leading-relaxed text-gray-400">
                                                {tutorial.description}
                                            </p>
                                            <div className="mt-auto pt-4 flex flex-wrap items-center gap-3">
                                                <a
                                                    href={tutorial.youtubeUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-300 hover:bg-cyan-500/15"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    {t.tutorials_watch_on_youtube}
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </motion.article>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
