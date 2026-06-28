"use client";
import { motion, useInView, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/* Scroll-triggered reveal — mirrors the static build's .reveal. */
export function Reveal({
  children, delay = 0, y = 24, className,
}: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* Animated count-up that runs once when scrolled into view. */
export function Counter({
  to, prefix = "", suffix = "", decimals = 0, className,
}: { to: number; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.1, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
