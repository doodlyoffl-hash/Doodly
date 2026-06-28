"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  STAGES, STAGE_LABEL, statusMessage, actionsFor, ACTION_META, stageIndexOf,
  isExceptionStatus, isEnRoute, type LiveStatus, type ActionKey,
} from "@/lib/order-status/engine";
import type { LiveStatusResponse, LiveStatusActive } from "@/lib/order-status/types";

const POLL_ACTIVE = 20_000;
const POLL_IDLE = 60_000;

/* visibility-aware polling — near real-time, pauses on hidden tabs, refetches on focus */
function useLiveStatus(): LiveStatusResponse | null {
  const [data, setData] = useState<LiveStatusResponse | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = (ms: number) => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(tick, ms); };
    async function tick() {
      try {
        const res = await fetch("/api/order-status", { cache: "no-store" });
        const j = (await res.json()) as LiveStatusResponse;
        if (!stopped) { setData(j); schedule(j.active ? POLL_ACTIVE : POLL_IDLE); }
      } catch { schedule(POLL_IDLE); }
    }
    const onFocus = () => { if (!document.hidden) tick(); };
    tick();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, []);
  return data;
}

const TONE: Record<string, string> = {
  info: "from-mint-soft/70 via-white to-mint-soft/30",
  active: "from-mint-soft/80 via-white to-gold-soft/40",
  success: "from-[#E4F6EC] via-white to-[#E4F6EC]",
  warning: "from-gold-soft/70 via-white to-gold-soft/30",
};

export function LiveOrderBanner() {
  const data = useLiveStatus();
  const live = data && data.active ? data : null;
  return (
    <AnimatePresence initial={false}>
      {live && <BannerInner key="live-order-banner" live={live} />}
    </AnimatePresence>
  );
}

function BannerInner({ live }: { live: LiveStatusActive }) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  // collapse state is remembered per-status, so a NEW status re-expands the banner
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(`doodly-banner-collapsed:${live.status}`) === "1"); } catch { /* ignore */ }
  }, [live.status]);
  const toggle = () => setCollapsed((c) => {
    const n = !c;
    try { localStorage.setItem(`doodly-banner-collapsed:${live.status}`, n ? "1" : "0"); } catch { /* ignore */ }
    return n;
  });

  const msg = statusMessage(live.status, {
    slot: live.delivery?.slot ?? live.subscription?.slot,
    etaMinutes: live.eta?.minutes,
    whenLabel: live.whenLabel,
    driverName: live.delivery?.driver?.name,
  });

  return (
    <motion.section
      aria-label="Live order status"
      initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className={`overflow-hidden border-b border-mint-soft bg-gradient-to-r ${TONE[msg.tone]}`}
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 py-3 sm:px-5">
        {/* header row */}
        <div className="flex items-center gap-3">
          <StatusEmoji emoji={msg.emoji} tone={msg.tone} reduce={!!reduce} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-forest sm:text-base">{msg.title}</p>
            {!collapsed && msg.subtitle && <p className="truncate text-xs text-ink-2 sm:text-sm">{msg.subtitle}</p>}
          </div>
          {live.eta && <EtaChip eta={live.eta} reduce={!!reduce} />}
          <button onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand order status" : "Collapse order status"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-mint-soft bg-white/70 text-ink-2 transition hover:border-leaf">
            <motion.span animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }} aria-hidden>▾</motion.span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }} className="overflow-hidden"
            >
              {!isExceptionStatus(live.status) && <Timeline status={live.status} reduce={!!reduce} />}
              {live.subscription && <SubscriptionCard sub={live.subscription} driver={live.delivery?.driver ?? null} />}
              <Actions live={live} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

/* ---------- status emoji (gentle pulse when active, pop on success) ---------- */
function StatusEmoji({ emoji, tone, reduce }: { emoji: string; tone: string; reduce: boolean }) {
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/80 text-xl shadow-sm">
      {!reduce && tone === "active" && <span className="absolute inset-0 animate-ping rounded-full bg-leaf/20" />}
      <motion.span aria-hidden initial={reduce ? false : { scale: tone === "success" ? 0.5 : 1 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} className="relative">{emoji}</motion.span>
    </span>
  );
}

/* ---------- ETA chip with a live countdown ---------- */
function EtaChip({ eta, reduce }: { eta: { minutes: number | null; arriving: boolean }; reduce: boolean }) {
  if (eta.arriving) {
    return (
      <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-leaf px-3 py-1.5 text-xs font-bold text-white sm:inline-flex">
        {!reduce && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />} Arriving now
      </span>
    );
  }
  if (eta.minutes != null) return <Countdown minutes={eta.minutes} />;
  return null;
}

function Countdown({ minutes }: { minutes: number }) {
  const target = useRef(Date.now() + minutes * 60_000);
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => { target.current = Date.now() + minutes * 60_000; setLeft(minutes * 60); }, [minutes]);
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((target.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(left / 60), ss = left % 60;
  return (
    <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-leaf px-3 py-1.5 text-xs font-bold text-white sm:inline-flex" aria-label={`Estimated arrival ${mm} minutes`}>
      🚚 {left > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : "Any moment"}
    </span>
  );
}

/* ---------- 6-stage progress timeline ---------- */
function Timeline({ status, reduce }: { status: LiveStatus; reduce: boolean }) {
  const cur = stageIndexOf(status);
  const enRoute = isEnRoute(status);
  return (
    <div className="mt-3 rounded-2xl border border-mint-soft bg-white/60 px-3 py-3">
      {/* slim progress bar (lightweight "filling" indicator) */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-mint-soft" aria-hidden>
        <motion.div className="h-full rounded-full bg-leaf" initial={{ width: 0 }} animate={{ width: `${((cur + 1) / STAGES.length) * 100}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
      </div>
      <ol className="flex items-start justify-between">
        {STAGES.map((st, i) => {
          const done = i < cur, active = i === cur;
          return (
            <li key={st} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span aria-hidden className={`absolute right-1/2 top-3 h-0.5 w-full ${i <= cur ? "bg-leaf" : "bg-mint-soft"}`} />}
              <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-colors ${done ? "bg-leaf text-white" : active ? "bg-leaf text-white" : "bg-white text-ink-3 ring-1 ring-mint-soft"}`}>
                {!reduce && active && <span className="absolute inset-0 animate-ping rounded-full bg-leaf/30" />}
                <span className="relative">{done ? "✓" : i + 1}</span>
                {enRoute && active && <span aria-hidden className="absolute -top-6 text-base">🚚</span>}
              </span>
              <span className={`mt-1.5 hidden text-[10px] leading-tight sm:block ${active ? "font-bold text-forest" : done ? "text-ink-2" : "text-ink-3"}`}>{STAGE_LABEL[st]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- subscription "next delivery" card ---------- */
function SubscriptionCard({ sub, driver }: { sub: NonNullable<LiveStatusActive["subscription"]>; driver: { name: string | null; rating: number; vehicleNo: string | null } | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-mint-soft bg-white/70 px-4 py-3 text-sm">
      <span className="font-display font-bold text-forest">🥛 Tomorrow&apos;s delivery</span>
      <Detail k="Product" v={`${sub.productLabel}${sub.sizeLabel ? ` · ${sub.sizeLabel}` : ""}${sub.qty > 1 ? ` × ${sub.qty}` : ""}`} />
      {sub.slot && <Detail k="Slot" v={sub.slot} />}
      {driver?.name && <Detail k="Driver" v={`${driver.name} ⭐ ${driver.rating.toFixed(1)}`} />}
      {sub.daysRemaining > 0 && <Detail k="Days left" v={`${sub.daysRemaining}`} />}
      {sub.status !== "ACTIVE" && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-bold text-gold">{sub.status}</span>}
    </div>
  );
}
function Detail({ k, v }: { k: string; v: string }) {
  return <span className="text-ink-2"><span className="text-xs text-ink-3">{k}:</span> <span className="font-semibold text-forest">{v}</span></span>;
}

/* ---------- contextual actions ---------- */
function Actions({ live }: { live: LiveStatusActive }) {
  const hasDriver = !!live.delivery?.driver;
  const canPause = !!live.subscription?.canPause;
  const keys = actionsFor(live.status).filter((k) => {
    const m = ACTION_META[k];
    if (m.needsDriver && !hasDriver) return false;
    if (m.needsSub && !canPause) return false;
    return true;
  });
  if (!keys.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {keys.map((k: ActionKey) => {
        const m = ACTION_META[k];
        return (
          <Link key={k} href={m.href}
            className={m.kind === "primary"
              ? "rounded-full bg-leaf px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
              : "rounded-full border border-mint-soft bg-white px-4 py-2 text-xs font-semibold text-forest transition hover:border-leaf"}>
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}
