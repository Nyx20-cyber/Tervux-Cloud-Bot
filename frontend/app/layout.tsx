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
import LocaleBootstrap from "@/components/LocaleBootstrap";

export const metadata: Metadata = {
  title: {
    default: "Tervux Cloud Bot | Easy Cloud Automation",
    template: "%s | Tervux Cloud"
  },
  description: "Connect and automate your messaging with ease. Fast. Secure. Professional. Cloud-based automation platform.",
  keywords: ["Tervux", "Cloud Bot", "Messenger Automation", "Chatbot SaaS", "Messaging API", "Cloud Automation"],
  authors: [{ name: "Tervux Team" }],
  creator: "Tervux",
  manifest: "/manifest.json",
  metadataBase: new URL("https://bot.tervux.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Tervux Cloud Bot | Professional Messaging Automation",
    description: "Connect and automate your messaging with ease. Fast. Secure. Professional.",
    url: "https://bot.tervux.com",
    siteName: "Tervux Cloud",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tervux Cloud Bot | Messaging Automation",
    description: "Connect and automate your messaging with ease. Fast. Secure. Professional.",
    creator: "@tervux",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tervux Bot",
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
            <LocaleBootstrap />
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
