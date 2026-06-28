"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { search, groupResults, highlight, type SearchItem, type SearchScope } from "@/lib/search/engine";
import { SEARCH_INDEX } from "@/config/search-index";

const RECENT_KEY = "doodly-recent-searches";

function readScope(): SearchScope {
  if (typeof document === "undefined") return "public";
  const role = document.cookie.match(/(?:^|;\s*)doodly-role=([^;]+)/)?.[1] ?? "";
  if (role === "admin" || role === "super_admin") return "admin";
  if (/(?:^|;\s*)doodly-uid=/.test(document.cookie)) return "customer";
  return "public";
}
const log = (kind: string, term: string, target?: string) =>
  fetch("/api/search/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, term, target }) }).catch(() => {});

const FILTERS = ["All", "Products", "Subscriptions", "Orders", "Help & FAQs", "Pages", "Customer", "Admin"] as const;

export function SearchPalette() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [active, setActive] = useState(0);
  const [dynamic, setDynamic] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const scope = useRef<SearchScope>("public");
  const inputRef = useRef<HTMLInputElement>(null);

  // open via Cmd/Ctrl+K or a dispatched event; close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("doodly:open-search", onOpen);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("doodly:open-search", onOpen); };
  }, []);

  // on open: focus, load scope/recent/trending, lock scroll
  useEffect(() => {
    if (!open) return;
    scope.current = readScope();
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { setRecent([]); }
    if (!trending.length) fetch("/api/search/trending").then((r) => r.json()).then((j) => setTrending(j.trending ?? [])).catch(() => {});
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.body.style.overflow = ""; };
  }, [open, trending.length]);

  // static results (instant) + debounced dynamic fetch + analytics
  const staticResults = useMemo(() => (query.trim() ? search(SEARCH_INDEX, query, { scope: scope.current, limit: 30 }) : []), [query]);
  useEffect(() => {
    if (!query.trim()) { setDynamic([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await (await fetch(`/api/search?q=${encodeURIComponent(query)}`)).json(); setDynamic(j.items ?? []); }
      catch { setDynamic([]); }
      finally { setLoading(false); }
    }, 220);
    const tl = setTimeout(() => { const total = staticResults.length; log(total ? "query" : "noresult", query); }, 600);
    return () => { clearTimeout(t); clearTimeout(tl); };
  }, [query, staticResults.length]);

  const combined = useMemo(() => {
    const all = [...staticResults, ...dynamic];
    if (filter === "All") return all;
    return all.filter((i) => i.category === filter);
  }, [staticResults, dynamic, filter]);

  const groups = useMemo(() => groupResults(combined), [combined]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => { setActive(0); }, [query, filter]);

  const close = useCallback(() => { setOpen(false); setQuery(""); setFilter("All"); }, []);

  const pushRecent = useCallback((term: string) => {
    const t = term.trim(); if (!t) return;
    setRecent((r) => { const next = [t, ...r.filter((x) => x !== t)].slice(0, 8); try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);

  const openItem = useCallback((item: SearchItem) => {
    log("click", query || item.title, item.id);
    pushRecent(query || item.title);
    close();
    router.push(item.href);
  }, [query, close, pushRecent, router]);

  const goResultsPage = useCallback(() => { if (!query.trim()) return; pushRecent(query); log("click", query, "__viewall__"); close(); router.push(`/search?q=${encodeURIComponent(query)}`); }, [query, pushRecent, close, router]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) return goResultsPage();
      if (flat[active]) openItem(flat[active]); else if (query.trim()) goResultsPage();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="overlay" className="fixed inset-0 z-[120] flex items-start justify-center bg-forest/30 p-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog" aria-modal="true" aria-label="Search DOODLY">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-[24px] border border-mint-soft bg-white/95 shadow-2xl backdrop-blur-xl">

            {/* input */}
            <div className="flex items-center gap-3 border-b border-mint-soft px-5 py-4">
              <span className="text-ink-3" aria-hidden>🔎</span>
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKey}
                type="search" autoComplete="off" role="combobox" aria-expanded aria-controls="search-results" aria-label="Search products, subscriptions, help and more"
                placeholder="Search products, plans, orders, help…"
                className="flex-1 bg-transparent text-base text-forest outline-none placeholder:text-ink-3" />
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-mint-soft border-t-leaf" aria-hidden />}
              <kbd className="hidden rounded-md border border-mint-soft px-1.5 py-0.5 text-[10px] font-semibold text-ink-3 sm:block">ESC</kbd>
            </div>

            {/* filters */}
            {query.trim() && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-mint-soft px-4 py-2">
                {FILTERS.map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f ? "bg-leaf text-white" : "border border-mint-soft text-ink-2 hover:border-leaf"}`}>{f}</button>
                ))}
              </div>
            )}

            <div id="search-results" role="listbox" className="max-h-[52vh] overflow-y-auto px-2 py-2">
              {/* empty state: recent + trending */}
              {!query.trim() ? (
                <div className="px-2 py-1">
                  {recent.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-bold uppercase tracking-wide text-ink-3">Recent</span>
                        <button onClick={() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch {} }} className="text-xs font-semibold text-leaf-600 hover:underline">Clear all</button></div>
                      {recent.map((r) => (
                        <div key={r} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-mint-soft/50">
                          <button onClick={() => setQuery(r)} className="flex flex-1 items-center gap-2 text-left text-sm text-forest"><span aria-hidden>🕘</span>{r}</button>
                          <button onClick={() => setRecent((x) => { const n = x.filter((y) => y !== r); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch {} return n; })} aria-label={`Remove ${r}`} className="text-xs text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-red-600">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-2 py-1"><span className="text-xs font-bold uppercase tracking-wide text-ink-3">Trending</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(trending.length ? trending : ["A2 Buffalo Milk", "Trial Pack", "Wallet"]).map((t) => (
                        <button key={t} onClick={() => setQuery(t)} className="rounded-full border border-mint-soft bg-white px-3 py-1.5 text-xs font-semibold text-forest transition hover:-translate-y-0.5 hover:border-leaf">🔥 {t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : flat.length === 0 && !loading ? (
                <p className="px-4 py-10 text-center text-sm text-ink-3">No results for “{query.trim()}”. Try “milk”, “wallet” or <button onClick={goResultsPage} className="font-semibold text-leaf-600 hover:underline">view all results</button>.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.category} className="mb-1">
                    <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink-3">{g.category}</p>
                    {g.items.map((item) => {
                      const idx = flat.indexOf(item);
                      const on = idx === active;
                      return (
                        <button key={item.id} id={`opt-${idx}`} role="option" aria-selected={on}
                          onMouseEnter={() => setActive(idx)} onClick={() => openItem(item)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-leaf/10" : "hover:bg-mint-soft/40"}`}>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mint-soft/70 text-lg" aria-hidden>{item.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-forest">{highlight(item.title, query).map((s, i) => s.hit ? <mark key={i} className="rounded bg-gold-soft/80 text-forest">{s.text}</mark> : <span key={i}>{s.text}</span>)}</span>
                            {item.subtitle && <span className="block truncate text-xs text-ink-3">{item.subtitle}</span>}
                          </span>
                          {item.action && on && <span className="shrink-0 rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-white">{item.action.label}</span>}
                          {on && !item.action && <span className="shrink-0 text-ink-3" aria-hidden>↵</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between border-t border-mint-soft px-4 py-2.5 text-[11px] text-ink-3">
              <span className="flex gap-3"><span>↑↓ navigate</span><span>↵ open</span><span className="hidden sm:inline">⌘↵ all results</span></span>
              {query.trim() && <button onClick={goResultsPage} className="font-semibold text-leaf-600 hover:underline">View all results →</button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
