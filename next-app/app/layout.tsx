import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import MotionProvider from "@/components/motion/MotionProvider";
import { Analytics } from "@/components/analytics/Analytics";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationLd, websiteLd, localBusinessLd } from "@/lib/seo";
import { RegisterSW } from "@/components/pwa/RegisterSW";

/* Self-hosted, preloaded, swap-rendered, variable fonts (no render-blocking
   Google <link>). next/font generates a metric-matched fallback → ~0 CLS.
   Display: Fraunces — a warm "soft serif" with true optical sizing (the opsz
   axis tightens detail as headings grow) → editorial, crafted, dairy-premium.
   Body: Hanken Grotesk — a humanist grotesque that's friendly and exceptionally
   legible on Windows/macOS/Android/iOS. The pairing is the DOODLY voice. */
const display = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yourdomain.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "DOODLY — Fresh A2 Buffalo Milk, Delivered Daily", template: "%s · DOODLY" },
  description: "Pure A2 buffalo milk from local farms — chilled within minutes, bottled in glass, and delivered to your door by 7 AM. Subscribe and save.",
  applicationName: "DOODLY",
  keywords: ["A2 buffalo milk", "fresh milk delivery", "glass bottle milk", "milk subscription", "Vijayawada milk", "farm fresh milk", "DOODLY"],
  authors: [{ name: "DOODLY" }],
  creator: "DOODLY",
  publisher: "DOODLY",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: true, email: true, address: true },
  openGraph: {
    type: "website", siteName: "DOODLY", locale: "en_IN", url: SITE_URL,
    title: "DOODLY — Fresh A2 Buffalo Milk, Delivered Daily",
    description: "Pure A2 buffalo milk in returnable glass bottles, at your door by 7 AM.",
  },
  twitter: {
    card: "summary_large_image", site: "@doodly", creator: "@doodly",
    title: "DOODLY — Fresh A2 Buffalo Milk, Delivered Daily",
    description: "Pure A2 buffalo milk in returnable glass bottles, at your door by 7 AM.",
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // Search Console verification (set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION in Vercel).
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFCFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0E2018" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      {/* sans.className applies Hanken Grotesk as the base body face AND tells
          next/font to <link rel="preload"> the critical body font. */}
      <body className={sans.className}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-leaf focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        {/* Site-wide structured data — Organization, WebSite (sitelinks search), LocalBusiness */}
        <JsonLd data={[organizationLd(), websiteLd(), localBusinessLd()]} />
        <Analytics />
        <RegisterSW />
      </body>
    </html>
  );
}
