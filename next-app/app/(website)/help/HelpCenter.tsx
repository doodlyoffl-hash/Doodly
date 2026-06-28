"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { searchFaqs, groupByCategory, categoryLabel, categoryIcon, type Faq } from "@/lib/help/engine";
import { HELP_QUICK_CARDS, HELP_VIDEOS, HELP_SUPPORT, HELP_TIPS } from "@/config/help-center";
import { HelpTip } from "@/components/help/HelpTip";

export function HelpCenter({ faqs }: { faqs: Faq[] }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchFaqs(faqs, query), [faqs, query]);
  const groups = useMemo(() => groupByCategory(results), [results]);
  const searching = query.trim().length > 0;

  // log searches (debounced, fire-and-forget) for the admin "most searched" report
  const logged = useRef("");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      if (logged.current === q) return;
      logged.current = q;
      fetch("/api/help/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term: q, resultCount: results.length }) }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [query, results.length]);

  const scrollTo = (id: string) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const replayTour = () => { try { localStorage.removeItem("doodly-tour-v1"); } catch {} window.dispatchEvent(new Event("doodly:start-tour")); };

  return (
    <div className="relative overflow-hidden">
      <DairyBackdrop reduce={!!reduce} />

      {/* hero + search */}
      <section className="relative mx-auto max-w-[900px] px-5 pb-6 pt-16 text-center">
        <p className="t-overline text-leaf-600">Help Center</p>
        <h1 className="t-display mt-3 text-forest">How can we help?</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-2">Search answers about subscriptions, delivery, wallet, payments, bottle returns and B2B — or browse the categories below.</p>

        <div className="relative mx-auto mt-7 max-w-xl">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden>🔎</span>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} type="search" autoComplete="off"
            aria-label="Search help articles" placeholder="Search: wallet, 8 PM cut-off, bottle return, Auto Pay…"
            className="w-full rounded-full border border-mint-soft bg-white py-3.5 pl-11 pr-4 text-sm shadow-sm focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30" />
          {searching && <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-3 hover:text-forest">✕</button>}
        </div>
        <button onClick={replayTour} className="mt-4 text-sm font-semibold text-leaf-600 hover:underline">▶ Replay the 60-second product tour</button>
      </section>

      {/* quick cards */}
      {!searching && (
        <section className="relative mx-auto max-w-[1000px] px-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {HELP_QUICK_CARDS.map((c) => (
              <button key={c.label} onClick={() => scrollTo(c.category)}
                className="group rounded-2xl border border-mint-soft bg-white/80 p-4 text-center backdrop-blur transition hover:-translate-y-1 hover:border-leaf hover:shadow-md">
                <div className="text-2xl transition-transform group-hover:scale-110">{c.icon}</div>
                <p className="mt-2 text-xs font-semibold text-forest">{c.label}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* quick explainers (contextual tooltips) */}
      {!searching && (
        <section className="relative mx-auto mt-8 max-w-[1000px] px-5">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-2xl border border-mint-soft bg-white/70 px-4 py-3 text-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Quick explainers:</span>
            {(Object.keys(HELP_TIPS) as (keyof typeof HELP_TIPS)[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-ink-2">
                {HELP_TIPS[k].title.replace(/^What is |^How (does|do) |\?$/g, "").replace(/\?$/, "")}
                <HelpTip tipKey={k} />
              </span>
            ))}
          </div>
        </section>
      )}

      {/* FAQ groups */}
      <section className="relative mx-auto mt-10 max-w-[820px] px-5 pb-4">
        {searching && (
          <p className="mb-4 text-sm text-ink-3" role="status">
            {results.length ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query.trim()}”` : `No results for “${query.trim()}” — try “delivery”, “wallet” or contact us below.`}
          </p>
        )}
        <div className="space-y-8">
          {groups.map((g, gi) => (
            <CategoryBlock key={g.id} id={g.id} faqs={g.faqs} index={gi} reduce={!!reduce} defaultOpen={searching} />
          ))}
        </div>
      </section>

      {/* video guides (future-ready) */}
      {!searching && (
        <section className="relative mx-auto mt-6 max-w-[1000px] px-5">
          <h2 className="t-h3 text-center text-forest">Video guides</h2>
          <p className="mt-1 text-center text-sm text-ink-3">Short walkthroughs — coming soon.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HELP_VIDEOS.map((v) => (
              <div key={v.id} className="overflow-hidden rounded-2xl border border-mint-soft bg-white">
                <div className="relative grid aspect-video place-items-center bg-gradient-to-br from-mint-soft to-white">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/80 text-leaf-600 shadow-sm" aria-hidden>▶</span>
                  <span className="absolute right-2 top-2 rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-gold">Soon</span>
                </div>
                <p className="px-3 py-2.5 text-sm font-semibold text-forest">{v.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* contact support */}
      <section className="relative mx-auto mt-12 max-w-[820px] px-5 pb-24">
        <div className="rounded-[28px] border border-mint-soft bg-gradient-to-br from-mint-soft/60 to-white p-8 text-center">
          <h2 className="t-h2 text-forest">Still need help?</h2>
          <p className="mt-2 text-ink-2">Our team is here Monday–Saturday, {HELP_SUPPORT.hours.replace("Mon–Sat, ", "")}.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={HELP_SUPPORT.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-full bg-leaf px-6 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5">💬 WhatsApp Support</a>
            <a href={`tel:${HELP_SUPPORT.phone.replace(/\s/g, "")}`} className="rounded-full border border-mint bg-white px-6 py-3 text-sm font-semibold text-forest transition hover:border-leaf">📞 Call Us</a>
            <a href={`mailto:${HELP_SUPPORT.email}`} className="rounded-full border border-mint bg-white px-6 py-3 text-sm font-semibold text-forest transition hover:border-leaf">✉️ Email Us</a>
          </div>
          <p className="mt-4 text-xs text-ink-3">Support hours · Monday–Saturday · 8:00 AM – 8:00 PM</p>
        </div>
      </section>
    </div>
  );
}

/* ---------- a category and its accordion FAQs ---------- */
function CategoryBlock({ id, faqs, index, reduce, defaultOpen }: { id: string; faqs: Faq[]; index: number; reduce: boolean; defaultOpen: boolean }) {
  return (
    <motion.div id={`cat-${id}`} className="scroll-mt-24"
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.25) }}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-forest">
        <span aria-hidden>{categoryIcon(id)}</span> {categoryLabel(id)}
      </h2>
      <ul className="divide-y divide-mint-soft overflow-hidden rounded-[24px] border border-mint-soft bg-white">
        {faqs.map((f) => <FaqItem key={f.id} faq={f} reduce={reduce} defaultOpen={defaultOpen} />)}
      </ul>
    </motion.div>
  );
}

function FaqItem({ faq, reduce, defaultOpen }: { faq: Faq; reduce: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const viewed = useRef(false);
  const toggle = () => {
    setOpen((o) => {
      const n = !o;
      if (n && !viewed.current) { viewed.current = true; fetch("/api/help/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: faq.id }) }).catch(() => {}); }
      return n;
    });
  };
  return (
    <li>
      <h3>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`panel-${faq.id}`} id={`trigger-${faq.id}`}
          className="relative flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-forest transition hover:text-leaf-600">
          {/* milk-ripple on open */}
          {open && !reduce && <motion.span aria-hidden className="pointer-events-none absolute left-5 top-1/2 h-2 w-2 rounded-full bg-leaf/30" initial={{ scale: 0, opacity: 0.6 }} animate={{ scale: 16, opacity: 0 }} transition={{ duration: 0.7 }} />}
          <span className="relative">{faq.question}</span>
          <motion.span aria-hidden animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-leaf-600">＋</motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`panel-${faq.id}`} role="region" aria-labelledby={`trigger-${faq.id}`}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
            <p className="px-5 pb-5 text-sm leading-relaxed text-ink-2">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ---------- subtle dairy-themed backdrop (decorative, reduced-motion safe) ---------- */
function DairyBackdrop({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gold-soft/40 blur-3xl" />
      <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-mint/30 blur-3xl" />
      {!reduce && [0, 1, 2, 3].map((i) => (
        <motion.span key={i} className="absolute text-2xl opacity-20"
          style={{ left: `${10 + i * 24}%`, top: `${20 + (i % 2) * 30}%` }}
          animate={{ y: [0, -14, 0] }} transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}>
          {["🥛", "🐃", "🦋", "🍶"][i]}
        </motion.span>
      ))}
    </div>
  );
}
