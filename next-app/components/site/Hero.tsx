"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import bottle from "@/public/products/milk-bottle.png";
import { Float } from "@/components/motion/Motion";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { Icon } from "./icons";

const TRUST = ["FSSAI Certified", "100% A2", "Glass bottles", "By 7 AM"];

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBottle = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 60]);
  const yGlow = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-to-b from-[#F1F8F3] to-milk">
      {/* decorative glows */}
      <motion.div style={{ y: yGlow }} aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-mint/40 blur-3xl" />
      <motion.div style={{ y: yGlow }} aria-hidden className="pointer-events-none absolute -left-20 top-40 h-72 w-72 rounded-full bg-gold-soft/50 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-mint bg-white/70 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-leaf-600 backdrop-blur"
          >
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" /></span>
            Delivering fresh in Vijayawada
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="t-display-xl mt-5"
          >
            Fresh Milk.<br /><em className="not-italic text-leaf-600">Delivered Daily.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 max-w-md text-lg leading-relaxed text-ink-2"
          >
            Pure A2 buffalo milk from local farms — chilled within minutes, bottled in glass, and at your door within 12 hours.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <MagneticButton href="/subscriptions" ariaLabel="Order fresh milk now"
              className="inline-flex items-center gap-2 rounded-full bg-leaf px-7 py-3.5 font-semibold text-white shadow-lg shadow-leaf/30 transition-shadow hover:shadow-xl hover:shadow-leaf/40">
              Order Now <span aria-hidden>→</span>
            </MagneticButton>
            <Link href="/farmers"
              className="group inline-flex items-center gap-2 rounded-full border border-mint bg-white px-7 py-3.5 font-semibold text-forest transition hover:border-leaf">
              Know Our Farmers
              <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.26 }}
            className="mt-9 flex flex-wrap gap-x-6 gap-y-2"
          >
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={11} /></span>{t}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* product card with floating bottle + glass reflection */}
        <motion.div style={{ y: yBottle }} className="relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative mx-auto max-w-sm overflow-hidden rounded-[36px] border border-white/70 bg-white/80 p-8 shadow-2xl backdrop-blur"
          >
            <span className="absolute right-5 top-5 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">Fresh today</span>
            <div className="relative grid place-items-center rounded-3xl bg-gradient-to-b from-mint-soft to-white py-6">
              {/* animated glass-reflection sheen */}
              {!reduce && (
                <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10"
                  initial={{ x: "-120%" }} animate={{ x: "120%" }} transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(110deg, transparent 40%, rgba(255,255,255,.65) 50%, transparent 60%)" }} />
              )}
              <Float distance={9} duration={4.5}>
                <Image src={bottle} alt="DOODLY fresh A2 buffalo milk in a glass bottle" placeholder="blur"
                  priority sizes="(max-width: 768px) 60vw, 280px" className="h-56 w-auto drop-shadow-2xl" />
              </Float>
            </div>
            <p className="mt-5 font-display text-2xl text-forest">1000 ml Family Bottle</p>
            <div className="mt-1 flex items-center gap-2 text-amber-500" aria-label="Rated 4.9 out of 5">
              <Icon name="star" size={14} /><span className="text-sm font-semibold text-ink-2">4.9 · 312 reviews</span>
            </div>
            <p className="mt-4 font-display text-4xl font-bold text-forest">₹130<span className="text-lg font-semibold text-ink-3"> / day</span></p>
            <p className="mt-1 text-sm font-semibold text-leaf-600">Returnable glass · Cancel anytime</p>
          </motion.div>
        </motion.div>
      </div>

      {/* scroll indicator */}
      {!reduce && (
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.6 }}
          className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2">
          <div className="flex h-9 w-6 items-start justify-center rounded-full border-2 border-leaf/50 p-1.5">
            <motion.span className="h-1.5 w-1.5 rounded-full bg-leaf" animate={{ y: [0, 8, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
          </div>
        </motion.div>
      )}
    </section>
  );
}
