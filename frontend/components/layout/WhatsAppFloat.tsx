"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/store/useAuthStore";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";

export function WhatsAppFloat() {
    const [config, setConfig] = useState<{ supportPhone: string } | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await api.get("/config");
                setConfig(res.data);
            } catch (err) {
                console.error("Failed to fetch platform config:", err);
            }
        };
        fetchConfig();

        // Show after a short delay
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleWhatsAppClick = () => {
        if (!config?.supportPhone) return;
        const phone = config.supportPhone.replace(/[^0-9]/g, "");
        const url = `https://wa.me/${phone}`;
        window.open(url, "_blank");
    };

    if (!config?.supportPhone) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    initial={{ scale: 0, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: 20 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleWhatsAppClick}
                    className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-[#25D366] text-white shadow-2xl shadow-[#25D366]/40 flex items-center justify-center border border-white/20 group"
                    title="Chat with Support"
                >
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 0.8, 0.5]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute inset-0 rounded-full bg-[#25D366]/50 -z-10"
                    />
                    <MessageCircle className="w-6 h-6 fill-white" />

                    {/* Tooltip */}
                    <span className="absolute right-full mr-4 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        Chat with Support
                    </span>
                </motion.button>
            )}
        </AnimatePresence>
    );
}
