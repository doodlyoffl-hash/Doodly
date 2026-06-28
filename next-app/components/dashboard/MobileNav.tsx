"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NavGroup } from "./Shell";

/* Mobile navigation drawer for the dashboard shell (the desktop sidebar is
   hidden below lg). Keyboard-accessible: opens a focus-trappable dialog,
   closes on Escape / backdrop, and locks body scroll while open. */
export default function MobileNav({ role, nav }: { role: string; nav: NavGroup[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="grid h-9 w-9 place-items-center rounded-full border border-mint-soft text-forest lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <nav id="mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation"
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-leaf-600">{role}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-full border border-mint-soft text-forest">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            {nav.map((g) => (
              <div key={g.heading} className="mb-4">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">{g.heading}</div>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-ink-2 hover:bg-[#F6FAF6] hover:text-forest">{i.label}</Link>
                ))}
              </div>
            ))}
            <Link href="/" onClick={() => setOpen(false)} className="mt-2 block border-t border-mint-soft px-3 pt-3 text-sm text-ink-2">← Back to site</Link>
          </nav>
        </div>
      )}
    </>
  );
}
