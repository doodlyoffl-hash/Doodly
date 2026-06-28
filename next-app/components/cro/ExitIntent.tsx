"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/* Desktop exit-intent offer — fires once per session when the cursor leaves
   the top of the viewport. Dismissable, keyboard-accessible, never on mobile. */
export function ExitIntent() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(pointer:coarse)").matches) return;          // skip touch devices
    try { if (sessionStorage.getItem("doodly-exit-shown")) return; } catch { /* ignore */ }
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        setOpen(true);
        try { sessionStorage.setItem("doodly-exit-shown", "1"); } catch { /* ignore */ }
        document.removeEventListener("mouseout", onLeave);
      }
    };
    const t = setTimeout(() => document.addEventListener("mouseout", onLeave), 4000);
    return () => { clearTimeout(t); document.removeEventListener("mouseout", onLeave); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-labelledby="exit-title"
        >
          <button type="button" aria-label="Close offer" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.2, 1.1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white p-8 text-center shadow-2xl"
          >
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-mint-soft text-forest">✕</button>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-mint-soft text-3xl" aria-hidden>🥛</div>
            <h2 id="exit-title" className="font-display text-3xl font-semibold text-forest">Before you go…</h2>
            <p className="mt-3 text-ink-2">Taste DOODLY for 3 mornings with our ₹200 trial pack — fresh A2 buffalo milk, no commitment.</p>
            <Link href="/subscriptions" onClick={() => setOpen(false)}
              className="mt-6 inline-block w-full rounded-full bg-leaf py-3.5 font-semibold text-white transition hover:-translate-y-0.5">
              Claim my trial pack
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="mt-3 text-sm text-ink-3 underline">No thanks</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
