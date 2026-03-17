import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import ParticlesBackground from "@/components/ParticlesBackground";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { translations } from "@/lib/translations";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: translations.en.site_title,
  description: translations.en.site_description,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tervux Cloud Bot",
    startupImage: "/icons/icon-512x512.png",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

import PWARegistration from "@/components/PWARegistration";

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
              <PWARegistration />
              {children}
            </div>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
