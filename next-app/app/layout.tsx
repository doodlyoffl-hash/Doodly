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

// This is metadataBase — it generates every canonical and og:url on the site. The
// fallback was "https://yourdomain.com", a placeholder we don't own, and
// NEXT_PUBLIC_SITE_URL is unset in Vercel, so that is what actually shipped: every
// page told Google its canonical lived on a stranger's parked domain, and every
// shared link previewed as theirs. See config/site.ts.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.doodly.in";

// Mirrors next.config.mjs: this deployment duplicates doodly.in page-for-page, so it
// stays out of the index until that's resolved. Flip with INDEXABLE=true.
const indexable = process.env.INDEXABLE === "true";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "DOODLY — Fresh A2 Buffalo Milk, Delivered Daily", template: "%s · DOODLY" },
  description: "A2 buffalo milk from family-run farms around Pamuru — collected at dusk, driven through the night, bottled in glass, and at your door by 7 AM. Subscribe and save.",
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
  robots: indexable
    ? {
        index: true, follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
      }
    : {
        // Duplicate of doodly.in — keep it out of search. Belt-and-braces with the
        // X-Robots-Tag header in next.config.mjs; either alone would do the job.
        index: false, follow: false,
        googleBot: { index: false, follow: false },
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
