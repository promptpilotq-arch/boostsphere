import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { getSettings } from "@/server/settings";
import { Toaster } from "@/components/client/toaster";


const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: `${s.brand.name} — ${s.brand.tagline}`, template: `%s | ${s.brand.name}` },
    description: s.home.heroSubtext,
    openGraph: { type: "website", siteName: s.brand.name, title: s.brand.name, description: s.home.heroSubtext },
    twitter: { card: "summary_large_image", title: s.brand.name, description: s.home.heroSubtext },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page render per request, which the nonce-based CSP requires.
  await headers();
  const s = await getSettings();
  const vars = `:root{--brand:${rgb(s.brand.primaryColor)};--brand-accent:${rgb(s.brand.accentColor)}}`;
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: vars }} />
      </head>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
