"use client";

import { useCallback, useEffect, useState } from "react";

interface Analytics {
  topSearches: { term: string; count: number }[];
  noResults: { term: string; count: number }[];
  topClicked: { target: string; count: number }[];
  conversionRate: number; totalQueries: number; totalClicks: number;
}
interface Trend { id: string; term: string; sortOrder: number; active: boolean }

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
  return j;
}

export function SearchInsights() {
  const [a, setA] = useState<Analytics | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [term, setTerm] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [an, tr] = await Promise.all([api("/api/search/admin?view=analytics"), api("/api/search/admin?view=trending")]);
      setA(an); setTrends(tr.trending);
    } catch (e) { flash((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, ok: string) {
    try { await api("/api/search/admin", { method: "POST", body: JSON.stringify(body) }); flash(ok); await load(); }
    catch (e) { flash((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      {a && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total searches" value={a.totalQueries.toLocaleString("en-IN")} />
          <Kpi label="Result clicks" value={a.totalClicks.toLocaleString("en-IN")} />
          <Kpi label="Conversion rate" value={`${a.conversionRate}%`} />
          <Kpi label="No-result terms" value={String(a.noResults.length)} />
        </div>
      )}

      {/* trending management */}
      <div className="rounded-2xl border border-mint-soft bg-white p-5">
        <h3 className="font-display text-base font-bold text-forest">Trending searches</h3>
        <p className="mb-3 text-xs text-ink-3">Shown as suggestion chips in the empty search palette.</p>
        <div className="mb-3 flex gap-2">
          <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && term.trim() && (act({ action: "add", term: term.trim() }, "Added"), setTerm(""))} placeholder="Add a trending term…" className="flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
          <button disabled={!term.trim()} onClick={() => { act({ action: "add", term: term.trim() }, "Added"); setTerm(""); }} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {trends.map((t) => (
            <span key={t.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${t.active ? "border-leaf bg-mint-soft/60 text-forest" : "border-mint-soft text-ink-3"}`}>
              🔥 {t.term}
              <button onClick={() => act({ action: "toggle", id: t.id, active: !t.active }, t.active ? "Hidden" : "Shown")} className="text-ink-3 hover:text-forest" aria-label={t.active ? "Hide" : "Show"}>{t.active ? "👁" : "🚫"}</button>
              <button onClick={() => act({ action: "remove", id: t.id }, "Removed")} className="text-red-500 hover:text-red-700" aria-label="Remove">✕</button>
            </span>
          ))}
          {!trends.length && <span className="text-sm text-ink-3">No trending terms yet.</span>}
        </div>
      </div>

      {a && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Table title="Most searched" head={["Term", "Count"]} rows={a.topSearches.map((s) => [s.term, String(s.count)])} empty="No searches yet" />
          <Table title="No-result searches" head={["Term", "Count"]} rows={a.noResults.map((s) => [s.term, String(s.count)])} empty="None — great coverage!" />
          <Table title="Most clicked results" head={["Result", "Clicks"]} rows={a.topClicked.map((s) => [s.target, String(s.count)])} empty="No clicks yet" />
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-mint-soft bg-white px-3 py-2"><p className="font-display text-xl font-bold text-forest">{value}</p><p className="text-xs text-ink-3">{label}</p></div>;
}
function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-mint-soft bg-white">
      <p className="border-b border-mint-soft bg-[#F6FAF6] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-ink-3"><tr>{head.map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-t border-mint-soft/60">{r.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? "truncate text-ink-2" : "font-semibold text-forest"}`}>{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
