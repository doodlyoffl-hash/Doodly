import Link from "next/link";
import Image from "next/image";
import { SITE } from "@/config/site";
import { Newsletter } from "./Newsletter";
import { DoodlyButton } from "./DoodlyButton";

const COLS = [
  { h: "Shop", links: [["Milk subscription", "/subscriptions"], ["Bulk orders", "/bulk-orders"], ["Sample pack", "/products/milk"], ["All products", "/products"]] },
  { h: "Company", links: [["About us", "/about"], ["Our farmers", "/farmers"], ["Quality & safety", "/quality"], ["Blog", "/blog"]] },
  { h: "Support", links: [["Help Center", "/help"], ["Contact", "/contact"], ["Bottle returns", "/bottle-return"], ["Delivery", "/delivery"]] },
  { h: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Refund policy", "/refund"], ["Shipping", "/shipping"]] },
];

// Only channels with a configured URL render (future ones stay "" in config/site.ts).
const SOCIAL: { label: string; href: string; path: string; chat?: boolean }[] = [
  { label: "Instagram", href: SITE.social.instagram, path: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>' },
  { label: "Facebook", href: SITE.social.facebook, path: '<path d="M14 8.5h2.4V5.6h-2.6C12 5.6 10.8 7 10.8 8.9V11H8.4v2.9h2.4V21h3v-7.1h2.3l.5-2.9h-2.8V9.2c0-.5.3-.7.9-.7Z" fill="currentColor" stroke="none"/>' },
  { label: "WhatsApp", href: `https://wa.me/${SITE.whatsapp}`, chat: true, path: '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.9c0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.14.24-3.66-.77-3.08-1.21-5.05-4.34-5.2-4.54-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.6-.38.8-.38.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.71.81 2.01.96.3.15.5.22.57.34.07.12.07.71-.17 1.39Z" fill="currentColor" stroke="none"/>' },
  { label: "YouTube", href: SITE.social.youtube, path: '<rect x="3" y="6.5" width="18" height="11" rx="3.2"/><path d="M11 10.2 15.2 12 11 13.8Z" fill="currentColor" stroke="none"/>' },
  { label: "LinkedIn", href: SITE.social.linkedin, path: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7" stroke-width="2"/>' },
].filter((s) => s.href);

export function Footer() {
  return (
    <footer className="border-t border-mint-soft bg-forest text-white/80">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12 sm:px-8 sm:py-16 lg:py-20">
        {/* Top: brand block + nav columns.
            < lg: stacked (brand over nav) · lg+: brand left, nav right */}
        <div className="grid gap-y-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,2.65fr)] lg:gap-x-16">
          {/* Brand + newsletter */}
          <div className="max-w-sm">
            <Image src="/logo.png" alt="DOODLY" width={130} height={48} className="h-9 w-auto brightness-0 invert" />
            <p className="mt-5 text-sm leading-relaxed text-white/70">
              DOODLY delivers A2 buffalo milk from a small circle of family-run farms around Pamuru — collected at dusk, chilled to 4°C, driven through the night, bottled in glass, and at your door within about 12 hours. No preservatives. Nothing added. Just honest milk.
            </p>
            <DoodlyButton variant="footer" />
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-white">Fresh tips &amp; offers</p>
              <Newsletter />
            </div>
          </div>

          {/* Nav columns — mobile: 1 col · tablet: 2×2 · desktop: 4 cols */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
            {COLS.map((c) => (
              <nav key={c.h} aria-label={c.h} className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-mint">{c.h}</h2>
                <ul className="mt-4 space-y-1">
                  {c.links.map(([label, href]) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group/l inline-flex w-fit py-1 text-[15px] font-medium leading-relaxed text-white/90 transition-colors duration-200 hover:text-mint"
                      >
                        <span className="relative after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-mint after:transition-all after:duration-300 group-hover/l:after:w-full">
                          {label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Bottom: divider + copyright + socials.
            mobile: stacked & centered (socials over copyright) · sm+: row, space-between */}
        <div className="mt-12 flex flex-col items-center gap-6 border-t border-white/10 pt-8 md:mt-14 md:flex-row md:items-center md:justify-between md:gap-4">
          <p className="order-2 text-center text-sm leading-relaxed text-white/60 md:order-1 md:text-left">
            © {new Date().getFullYear()} {SITE.legalName} · {SITE.city}, {SITE.region}
          </p>
          <div className="order-1 flex items-center justify-center gap-2.5 md:order-2">
            {SOCIAL.map((s) => (
              <a
                key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                aria-label={s.chat ? "Chat with DOODLY on WhatsApp" : `Follow DOODLY on ${s.label}`}
                title={s.chat ? "Chat with us on WhatsApp" : `Follow DOODLY on ${s.label}`}
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-white/20 text-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:border-mint hover:bg-mint hover:text-forest hover:shadow-lg hover:shadow-mint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-forest"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.path }} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
