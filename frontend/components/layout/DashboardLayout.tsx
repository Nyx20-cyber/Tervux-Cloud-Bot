"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WhatsAppFloat } from "./WhatsAppFloat";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-transparent">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Mobile Sidebar */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="p-0 border-r border-border bg-card/90 backdrop-blur-2xl w-64">
                    <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                    <Sidebar isMobile />
                </SheetContent>
            </Sheet>

            <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
                <Header onMenuClick={() => setMobileMenuOpen(true)} />
                <main className="flex-1 overflow-y-auto w-full no-scrollbar">
                    <div className="mx-auto max-w-7xl p-4 lg:p-8 animate-fade-in relative z-10 w-full min-h-full">
                        {children}
                    </div>
                </main>
                <WhatsAppFloat />
            </div>
        </div>
    )
}
