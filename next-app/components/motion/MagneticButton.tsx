"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import type { ReactNode } from "react";

/* Magnetic CTA — the button gently follows the cursor (desktop, fine pointer),
   with a hover glow + ripple-free press scale. Falls back to a plain Link under
   reduced-motion or coarse pointers. */
export function MagneticButton({
  href, children, className, ariaLabel,
}: { href: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 250, damping: 18, mass: 0.4 });

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    if (!window.matchMedia("(pointer:fine)").matches) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.25);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  }
  function reset() { x.set(0); y.set(0); }

  return (
    <motion.div style={{ x: sx, y: sy, display: "inline-block" }} onMouseMove={onMove} onMouseLeave={reset}>
      <Link
        ref={ref}
        href={href}
        aria-label={ariaLabel}
        className={className}
        onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      >
        {children}
      </Link>
    </motion.div>
  );
}
