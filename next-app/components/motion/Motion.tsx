"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/* =============================================================
   DOODLY — reusable scroll/entrance primitives (Framer Motion)
   All honour prefers-reduced-motion (globally via MotionProvider's
   reducedMotion="user", and here we also skip transforms). GPU-only
   (transform/opacity) for 60 FPS.
   ============================================================= */

type Dir = "up" | "down" | "left" | "right" | "none";
const offset = (d: Dir, amt: number) =>
  d === "up" ? { y: amt } : d === "down" ? { y: -amt } : d === "left" ? { x: amt } : d === "right" ? { x: -amt } : {};

export function FadeIn({
  children, direction = "up", amount = 24, delay = 0, duration = 0.6, className, as = "div",
}: { children: ReactNode; direction?: Dir; amount?: number; delay?: number; duration?: number; className?: string; as?: "div" | "section" | "li" | "span" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, ...offset(direction, amount) }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </Comp>
  );
}

export function ScaleIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.2, 1.2, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } },
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={staggerChild}>{children}</motion.div>;
}

/* Gentle infinite float (milk bottle / decorative). Disabled under reduced motion. */
export function Float({ children, className, distance = 10, duration = 4 }: { children: ReactNode; className?: string; distance?: number; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -distance, 0] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      style={{ willChange: "transform" }}
    >
      {children}
    </motion.div>
  );
}
