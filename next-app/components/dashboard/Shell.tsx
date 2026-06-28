import Link from "next/link";
import Image from "next/image";
import MobileNav from "./MobileNav";
import { SearchTrigger } from "@/components/search/SearchTrigger";
import { SearchPalette } from "@/components/search/SearchPalette";

export interface NavItem { label: string; href: string }
export interface NavGroup { heading: string; items: NavItem[] }

/** Shared app-shell for the customer, admin and delivery surfaces.
 *  Mirrors the static build's sidebar + topbar + content layout. */
export default function Shell({
  role, nav, children,
}: { role: string; nav: NavGroup[]; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
      <aside className="hidden flex-col border-r border-mint-soft bg-white lg:flex">
        <div className="flex items-center gap-2 border-b border-mint-soft px-5 py-4">
          <Image src="/logo.png" alt="DOODLY Logo" width={104} height={38} className="h-8 w-auto" />
          <span className="ml-auto rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-leaf-600">{role}</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {nav.map((g) => (
            <div key={g.heading} className="mb-4">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">{g.heading}</div>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className="block rounded-xl px-3 py-2 text-sm font-medium text-ink-2 hover:bg-[#F6FAF6] hover:text-forest">{i.label}</Link>
              ))}
            </div>
          ))}
        </nav>
        <Link href="/" className="border-t border-mint-soft px-5 py-3 text-sm text-ink-2">← Back to site</Link>
      </aside>
      <div className="flex flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-mint-soft bg-white/70 px-4 backdrop-blur sm:px-6">
          <MobileNav role={role} nav={nav} />
          <SearchTrigger variant="bar" className="hidden md:flex md:w-80 md:justify-start" />
          <SearchTrigger variant="icon" className="md:hidden" />
          <div className="ml-auto flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf text-sm font-bold text-white" aria-hidden="true">DL</span>
          </div>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </div>
      {/* Global Cmd+K search palette (scope-aware: customer / admin / driver) */}
      <SearchPalette />
    </div>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-3xl text-forest">{title}</h1>
      {sub && <p className="mt-1 text-ink-2">{sub}</p>}
    </div>
  );
}

export function StatCard({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-[28px] border border-mint-soft bg-white p-5">
      <div className="font-display text-2xl font-bold text-leaf-600">{n}</div>
      <div className="mt-1 text-sm text-ink-3">{l}</div>
    </div>
  );
}
