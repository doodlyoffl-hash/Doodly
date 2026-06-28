"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TESTIMONIALS } from "@/config/site";
import { Icon } from "./icons";

export function Testimonials() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = TESTIMONIALS.length;

  useEffect(() => {
    if (reduce || paused) return;
    const id = setInterval(() => setI((p) => (p + 1) % n), 5000);
    return () => clearInterval(id);
  }, [reduce, paused, n]);

  const go = (d: number) => setI((p) => (p + d + n) % n);
  const t = TESTIMONIALS[i];

  return (
    <section className="bg-[#F6FAF6]">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="t-overline text-leaf-600">Loved by families</p>
        <h2 className="t-h1 mt-3.5">What our customers say.</h2>

        <div
          className="relative mt-12 min-h-[230px]"
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
          aria-roledescription="carousel" aria-label="Customer testimonials"
        >
          <AnimatePresence mode="wait">
            <motion.figure
              key={i}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="rounded-[32px] border border-mint-soft bg-white p-9 shadow-sm"
              aria-live="polite"
            >
              <div className="flex justify-center gap-1 text-amber-500" aria-label={`${t.rating} out of 5 stars`}>
                {Array.from({ length: t.rating }).map((_, k) => <Icon key={k} name="star" size={18} />)}
              </div>
              <blockquote className="mt-5 font-display text-2xl leading-relaxed text-forest">&ldquo;{t.text}&rdquo;</blockquote>
              <figcaption className="mt-6">
                <span className="font-semibold text-forest">{t.name}</span>
                <span className="text-ink-3"> · {t.role}</span>
              </figcaption>
            </motion.figure>
          </AnimatePresence>
        </div>

        <div className="mt-7 flex items-center justify-center gap-4">
          <button type="button" onClick={() => go(-1)} aria-label="Previous testimonial" className="grid h-10 w-10 place-items-center rounded-full border border-mint-soft bg-white text-forest transition hover:border-leaf">‹</button>
          <div className="flex gap-2" role="tablist">
            {TESTIMONIALS.map((_, k) => (
              <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`Go to testimonial ${k + 1}`}
                onClick={() => setI(k)} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-leaf" : "w-2 bg-mint"}`} />
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Next testimonial" className="grid h-10 w-10 place-items-center rounded-full border border-mint-soft bg-white text-forest transition hover:border-leaf">›</button>
        </div>
      </div>
    </section>
  );
}
