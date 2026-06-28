"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TOUR_STEPS } from "@/config/help-center";

const SEEN_KEY = "doodly-tour-v1";
type Phase = "hidden" | "welcome" | "tour" | "done";

const ping = (kind: "started" | "completed" | "skipped") =>
  fetch("/api/help/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).catch(() => {});

export function WelcomeTour() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [step, setStep] = useState(0);

  const seen = () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; } };
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } };

  // first visit → welcome (after a beat, so it never blocks first paint); also
  // listen for an explicit replay request from the Help Center.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (!seen()) t = setTimeout(() => setPhase((p) => (p === "hidden" ? "welcome" : p)), 1200);
    const replay = () => { setStep(0); setPhase("welcome"); };
    window.addEventListener("doodly:start-tour", replay);
    return () => { clearTimeout(t); window.removeEventListener("doodly:start-tour", replay); };
  }, []);

  const close = useCallback((reason: "skipped" | "completed") => {
    markSeen(); ping(reason); setPhase("done");
  }, []);

  // Esc closes (counts as skip)
  useEffect(() => {
    if (phase !== "welcome" && phase !== "tour") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skipped");
      if (phase === "tour" && e.key === "ArrowRight") setStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1));
      if (phase === "tour" && e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, close]);

  if (phase !== "welcome" && phase !== "tour") return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-overlay" className="fixed inset-0 z-[100] grid place-items-center bg-forest/40 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        role="dialog" aria-modal="true" aria-label={phase === "welcome" ? "Welcome to DOODLY" : "DOODLY product tour"}
        onClick={(e) => { if (e.target === e.currentTarget) close("skipped"); }}>
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-mint-soft bg-white shadow-2xl">

          {phase === "welcome" ? (
            <div className="px-7 py-9 text-center">
              <motion.div initial={reduce ? false : { scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 12 }} className="text-5xl">👋</motion.div>
              <h2 className="mt-4 font-display text-2xl font-bold text-forest">Welcome to DOODLY</h2>
              <p className="mt-2 font-display text-lg text-ink-2">Fresh dairy, delivered the way it should be.</p>
              <p className="mt-2 text-sm text-ink-3">Let&apos;s show you how DOODLY works in less than a minute.</p>
              <div className="mt-7 flex flex-col gap-2">
                <button autoFocus onClick={() => { setStep(0); setPhase("tour"); ping("started"); }} className="rounded-full bg-leaf px-6 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5">Start Tour →</button>
                <button onClick={() => close("skipped")} className="rounded-full px-6 py-2.5 text-sm font-semibold text-ink-3 hover:text-forest">Skip for Now</button>
              </div>
            </div>
          ) : (
            <div>
              {/* progress */}
              <div className="flex items-center gap-1.5 px-7 pt-6">
                {TOUR_STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-leaf" : "bg-mint-soft"}`} />
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={step}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
                  transition={{ duration: 0.25 }} className="px-7 py-7 text-center">
                  <div className="grid place-items-center">
                    {last ? (
                      <motion.div initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 240, damping: 12 }} className="grid h-16 w-16 place-items-center rounded-full bg-leaf text-3xl text-white">🎉</motion.div>
                    ) : (
                      <div className="text-5xl">{s.emoji}</div>
                    )}
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-leaf-600">Step {s.n} of {TOUR_STEPS.length}</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-forest">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
                  <Link href={s.href} onClick={() => close("completed")} className="mt-4 inline-block text-sm font-semibold text-leaf-600 hover:underline">{s.cta} →</Link>
                </motion.div>
              </AnimatePresence>

              {/* controls */}
              <div className="flex items-center justify-between gap-3 border-t border-mint-soft px-7 py-4">
                <button onClick={() => (step === 0 ? close("skipped") : setStep((x) => x - 1))} className="text-sm font-semibold text-ink-3 hover:text-forest">{step === 0 ? "Skip" : "Back"}</button>
                {last ? (
                  <button onClick={() => close("completed")} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white">You&apos;re ready ✓</button>
                ) : (
                  <button autoFocus onClick={() => setStep((x) => Math.min(TOUR_STEPS.length - 1, x + 1))} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5">Next →</button>
                )}
              </div>
            </div>
          )}

          <button onClick={() => close("skipped")} aria-label="Close tour" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-3 transition hover:bg-mint-soft hover:text-forest">✕</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
