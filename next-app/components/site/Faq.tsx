"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FAQS } from "@/config/site";

export function Faq() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-3xl px-5 py-24">
      <div className="text-center">
        <p className="t-overline text-leaf-600">Help centre</p>
        <h2 className="t-h1 mt-3.5">Frequently asked questions.</h2>
      </div>

      <ul className="mt-12 divide-y divide-mint-soft rounded-[28px] border border-mint-soft bg-white">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <li key={f.q}>
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-trigger-${i}`}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-forest transition hover:text-leaf-600"
                >
                  <span>{f.q}</span>
                  <span aria-hidden className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-mint-soft text-leaf-600 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>+</span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-trigger-${i}`}
                    initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-6 leading-relaxed text-ink-2">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
