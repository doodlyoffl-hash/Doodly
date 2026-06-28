"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { search, groupResults, highlight, type SearchItem, type SearchScope } from "@/lib/search/engine";
import { SEARCH_INDEX } from "@/config/search-index";

function readScope(): SearchScope {
  if (typeof document === "undefined") return "public";
  const role = document.cookie.match(/(?:^|;\s*)doodly-role=([^;]+)/)?.[1] ?? "";
  if (role === "admin" || role === "super_admin") return "admin";
  if (/(?:^|;\s*)doodly-uid=/.test(document.cookie)) return "customer";
  return "public";
}

const FILTERS = ["All", "Products", "Subscriptions", "Orders", "Help & FAQs", "Pages", "Customer"] as const;

export function SearchResults() {
  const sp = useSearchParams();
  const [query, setQuery] = useState(sp.get("q") ?? "");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [dynamic, setDynamic] = useState<SearchItem[]>([]);
  const [scope, setScope] = useState<SearchScope>("public");

  useEffect(() => { setScope(readScope()); }, []);
  useEffect(() => { setQuery(sp.get("q") ?? ""); }, [sp]);

  const staticResults = useMemo(() => (query.trim() ? search(SEARCH_INDEX, query, { scope, limit: 60 }) : []), [query, scope]);
  useEffect(() => {
    if (!query.trim()) { setDynamic([]); return; }
    const t = setTimeout(async () => {
      try { const j = await (await fetch(`/api/search?q=${encodeURIComponent(query)}`)).json(); setDynamic(j.items ?? []); } catch { setDynamic([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const combined = useMemo(() => {
    const all = [...staticResults, ...dynamic];
    return filter === "All" ? all : all.filter((i) => i.category === filter);
  }, [staticResults, dynamic, filter]);
  const groups = useMemo(() => groupResults(combined), [combined]);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-12">
      <h1 className="t-h1 text-forest">Search</h1>
      <div className="relative mt-5">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden>🔎</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus type="search" aria-label="Search DOODLY"
          placeholder="Search products, plans, orders, help…" className="w-full rounded-full border border-mint-soft bg-white py-3.5 pl-11 pr-4 text-sm shadow-sm focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === f ? "bg-leaf text-white" : "border border-mint-soft text-ink-2 hover:border-leaf"}`}>{f}</button>
        ))}
      </div>

      {query.trim() && <p className="mt-5 text-sm text-ink-3">{combined.length} result{combined.length === 1 ? "" : "s"} for “{query.trim()}”</p>}

      {!query.trim() ? (
        <p className="mt-16 text-center text-ink-3">Start typing to search across products, subscriptions, help and your account.</p>
      ) : combined.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-ink-2">No results for “{query.trim()}”.</p>
          <p className="mt-2 text-sm text-ink-3">Try a product like “milk” or a topic like “wallet”, or <Link href="/help" className="font-semibold text-leaf-600 hover:underline">browse the Help Center</Link>.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 font-display text-lg font-bold text-forest">{g.category}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.2) }}>
                    <Link href={item.href} className="group flex h-full items-center gap-4 rounded-2xl border border-mint-soft bg-white p-4 transition hover:-translate-y-1 hover:border-leaf hover:shadow-md">
                      {item.image
                        ? <Image src={item.image} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl object-contain" />
                        : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-mint-soft/70 text-2xl" aria-hidden>{item.icon}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-forest">{highlight(item.title, query).map((s, k) => s.hit ? <mark key={k} className="rounded bg-gold-soft/80 text-forest">{s.text}</mark> : <span key={k}>{s.text}</span>)}</p>
                        {item.subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{item.subtitle}</p>}
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-leaf-600">{item.category}</p>
                      </div>
                      {item.action && <span className="shrink-0 rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest transition group-hover:border-leaf group-hover:text-leaf-600">{item.action.label}</span>}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
