import Link from "next/link";
import Image from "next/image";
import PageTransition from "@/components/motion/PageTransition";
import { Footer } from "@/components/site/Footer";
import { DoodlyButton } from "@/components/site/DoodlyButton";
import { LiveOrderBanner } from "@/components/order-status/LiveOrderBanner";
import { WelcomeTour } from "@/components/help/WelcomeTour";
import { SearchTrigger } from "@/components/search/SearchTrigger";
import { SearchPalette } from "@/components/search/SearchPalette";
import { ScrollProgress } from "@/components/cro/ScrollProgress";
import { StickyOrderBar } from "@/components/cro/StickyOrderBar";
import { FloatingWhatsApp } from "@/components/cro/FloatingWhatsApp";
import { ExitIntent } from "@/components/cro/ExitIntent";

const NAV = [
  ["About", "/about"], ["Our Farmers", "/farmers"], ["Products", "/products"],
  ["Subscriptions", "/subscriptions"], ["Bulk Orders", "/bulk-orders"],
  ["Delivery", "/delivery"], ["Quality", "/quality"], ["Help", "/help"], ["Contact", "/contact"],
];

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollProgress />
      <nav className="sticky top-0 z-50 flex h-[68px] items-center border-b border-mint-soft bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-6 px-5">
          <Link href="/" aria-label="DOODLY home"><Image src="/logo.png" alt="DOODLY Logo" width={120} height={44} priority className="h-9 w-auto" /></Link>
          <ul className="ml-4 hidden gap-5 lg:flex xl:gap-6">
            {NAV.map(([l, h]) => (
              <li key={h}>
                <Link
                  href={h}
                  className="relative text-sm text-ink-2 transition-colors hover:text-leaf-600 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:rounded-full after:bg-leaf after:transition-all after:duration-300 hover:after:w-full"
                >
                  {l}
                </Link>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2">
            <SearchTrigger variant="bar" className="hidden lg:inline-flex" />
            <SearchTrigger variant="icon" className="lg:hidden" />
            <DoodlyButton variant="header" />
            <Link href="/login" className="hidden rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest transition-colors hover:border-leaf hover:text-leaf-600 sm:inline-block">Log in</Link>
            <Link href="/subscriptions" className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5">Subscribe</Link>
          </div>
        </div>
      </nav>

      {/* Live order status — appears below the navbar only when a customer has an active order/delivery */}
      <LiveOrderBanner />

      <main id="main-content"><PageTransition>{children}</PageTransition></main>

      <Footer />

      {/* Conversion layer — progress bar, mobile sticky CTA, WhatsApp, exit intent */}
      <StickyOrderBar />
      <FloatingWhatsApp />
      <ExitIntent />

      {/* First-time guided onboarding (self-suppresses after the user's choice) */}
      <WelcomeTour />

      {/* Global Cmd+K smart search */}
      <SearchPalette />
    </>
  );
}
