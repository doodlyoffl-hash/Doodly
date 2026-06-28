"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HELP_TIPS } from "@/config/help-center";

/* Contextual help icon (ⓘ) that reveals a concise explanation. Accessible:
   labelled trigger, Esc + click-outside close, keyboard focusable popover.
   Pass `tipKey` (looked up in config/help-center HELP_TIPS) or title+body. */
export function HelpTip({ tipKey, title, body, href, label, size = 16 }: {
  tipKey?: keyof typeof HELP_TIPS; title?: string; body?: string; href?: string; label?: string; size?: number;
}) {
  const tip = tipKey ? HELP_TIPS[tipKey] : undefined;
  const t = title ?? tip?.title ?? "Help";
  const b = body ?? tip?.body ?? "";
  const link = href ?? tip?.href;

  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        aria-label={label ?? `Help: ${t}`}
        className="grid place-items-center rounded-full border border-mint-soft bg-white text-ink-3 transition hover:border-leaf hover:text-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
        style={{ width: size + 6, height: size + 6 }}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><circle cx="12" cy="8" r=".6" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id} role="dialog" aria-label={t}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-2xl border border-mint-soft bg-white p-4 text-left shadow-xl">
            <span className="block font-display text-sm font-bold text-forest">{t}</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-2">{b}</span>
            {link && <Link href={link} onClick={() => setOpen(false)} className="mt-2 inline-block text-xs font-semibold text-leaf-600 hover:underline">Learn more →</Link>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
