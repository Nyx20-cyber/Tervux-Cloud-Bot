import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import ParticlesBackground from "@/components/ParticlesBackground";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { Toaster } from "@/components/ui/sonner";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Tervux Cloud Bot | UPLINK V2.0",
  description: "Establish a high-bandwidth neural connection to your WhatsApp instance. Encrypted. Autonomous.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.variable} antialiased min-h-screen relative overflow-x-hidden selection:bg-primary/30`}>
        <AuthProvider>
          <TooltipProvider>
            <ParticlesBackground />
            <div className="relative z-10 w-full">
              {children}
            </div>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
