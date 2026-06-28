"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Article { id: string; category: string; question: string; answer: string; keywords: string[]; sortOrder: number; published: boolean; views: number }
interface Analytics {
  topViewed: { id: string; question: string; category: string; views: number }[];
  topSearches: { term: string; count: number }[];
  unanswered: { term: string; count: number }[];
  tour: { started: number; completed: number; skipped: number; completionRate: number };
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
  return j;
}

export function HelpCenterAdmin({ categories }: { categories: { id: string; label: string }[] }) {
  const [tab, setTab] = useState<"articles" | "analytics">("articles");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-mint-soft">
        {(["articles", "analytics"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold capitalize transition ${tab === t ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t}</button>
        ))}
      </div>
      {tab === "articles" ? <Articles categories={categories} flash={flash} /> : <Analytics flash={flash} catLabel={Object.fromEntries(categories.map((c) => [c.id, c.label]))} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Articles({ categories, flash }: { categories: { id: string; label: string }[]; flash: (m: string) => void }) {
  const [rows, setRows] = useState<Article[]>([]);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const catLabel = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.label])), [categories]);

  const load = useCallback(async () => { try { const j = await api("/api/help/admin?view=articles"); setRows(j.articles); } catch (e) { flash((e as Error).message); } }, [flash]);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, ok: string) {
    try { await api("/api/help/admin", { method: "POST", body: JSON.stringify(body) }); flash(ok); await load(); return true; }
    catch (e) { flash((e as Error).message); return false; }
  }

  async function move(a: Article, dir: -1 | 1) {
    const peers = rows.filter((r) => r.category === a.category).sort((x, y) => x.sortOrder - y.sortOrder);
    const idx = peers.findIndex((r) => r.id === a.id);
    const swap = peers[idx + dir];
    if (!swap) return;
    await act({ action: "reorder", items: [{ id: a.id, sortOrder: swap.sortOrder }, { id: swap.id, sortOrder: a.sortOrder }] }, "Reordered");
  }

  const shown = rows.filter((r) => !filter || r.category === filter);
  const grouped = categories.map((c) => ({ ...c, items: shown.filter((r) => r.category === c.id).sort((a, b) => a.sortOrder - b.sortOrder) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-mint-soft px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <p className="text-sm text-ink-3">{rows.length} FAQs</p>
        <button onClick={() => setAdding((v) => !v)} className="ml-auto rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">{adding ? "Close" : "+ Add FAQ"}</button>
      </div>

      {adding && <ArticleForm categories={categories} onSave={async (d) => { if (await act({ action: "create", ...d }, "FAQ added")) setAdding(false); }} />}

      {grouped.map((g) => (
        <div key={g.id}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{g.label}</p>
          <div className="divide-y divide-mint-soft overflow-hidden rounded-2xl border border-mint-soft bg-white">
            {g.items.map((a, i) => (
              <ArticleRow key={a.id} a={a} categories={categories} catLabel={catLabel} first={i === 0} last={i === g.items.length - 1}
                onMove={(dir) => move(a, dir)}
                onPublish={() => act({ action: "publish", id: a.id, published: !a.published }, a.published ? "Unpublished" : "Published")}
                onSave={(d) => act({ action: "update", id: a.id, ...d }, "FAQ updated")}
                onDelete={() => confirm(`Delete “${a.question}”?`) && act({ action: "delete", id: a.id }, "FAQ deleted")} />
            ))}
          </div>
        </div>
      ))}
      {!grouped.length && <p className="rounded-2xl border border-mint-soft bg-white px-4 py-10 text-center text-ink-3">No FAQs yet.</p>}
    </div>
  );
}

function ArticleRow({ a, categories, catLabel, first, last, onMove, onPublish, onSave, onDelete }: {
  a: Article; categories: { id: string; label: string }[]; catLabel: Record<string, string>; first: boolean; last: boolean;
  onMove: (dir: -1 | 1) => void; onPublish: () => void; onSave: (d: Record<string, unknown>) => Promise<boolean>; onDelete: () => void;
}) {
  const [edit, setEdit] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button disabled={first} onClick={() => onMove(-1)} aria-label="Move up" className="text-xs text-ink-3 disabled:opacity-30">▲</button>
          <button disabled={last} onClick={() => onMove(1)} aria-label="Move down" className="text-xs text-ink-3 disabled:opacity-30">▼</button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-forest">{a.question}</p>
          <p className="truncate text-xs text-ink-3">{catLabel[a.category] ?? a.category} · {a.views} views</p>
        </div>
        {!a.published && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-gold">Draft</span>}
        <button onClick={onPublish} className="text-xs font-semibold text-ink-2 underline">{a.published ? "Unpublish" : "Publish"}</button>
        <button onClick={() => setEdit((v) => !v)} className="text-xs font-semibold text-leaf-600 underline">{edit ? "Close" : "Edit"}</button>
        <button onClick={onDelete} className="text-xs font-semibold text-red-600 underline">Delete</button>
      </div>
      {edit && <div className="mt-3"><ArticleForm categories={categories} initial={a} onSave={async (d) => { if (await onSave(d)) setEdit(false); }} /></div>}
    </div>
  );
}

function ArticleForm({ categories, initial, onSave }: { categories: { id: string; label: string }[]; initial?: Article; onSave: (d: Record<string, unknown>) => void | Promise<void> }) {
  const [category, setCategory] = useState(initial?.category ?? categories[0]?.id ?? "");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(", "));
  const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm";
  return (
    <div className="grid gap-2 rounded-xl border border-mint-soft bg-[#F6FAF6] p-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-ink-3">Category<select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inp} mt-1`}>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="text-xs font-semibold text-ink-3">Keywords (comma-separated)<input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={`${inp} mt-1`} /></label>
      <label className="text-xs font-semibold text-ink-3 sm:col-span-2">Question<input value={question} onChange={(e) => setQuestion(e.target.value)} className={`${inp} mt-1`} /></label>
      <label className="text-xs font-semibold text-ink-3 sm:col-span-2">Answer<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className={`${inp} mt-1`} /></label>
      <button onClick={() => onSave({ category, question, answer, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) })}
        disabled={!question.trim() || !answer.trim()} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 sm:w-fit">Save</button>
    </div>
  );
}

function Analytics({ flash, catLabel }: { flash: (m: string) => void; catLabel: Record<string, string> }) {
  const [d, setD] = useState<Analytics | null>(null);
  useEffect(() => { api("/api/help/admin?view=analytics").then(setD).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!d) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Tours started" value={String(d.tour.started)} />
        <Kpi label="Tours completed" value={String(d.tour.completed)} />
        <Kpi label="Tours skipped" value={String(d.tour.skipped)} />
        <Kpi label="Completion rate" value={`${d.tour.completionRate}%`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Table title="Most viewed FAQs" head={["Question", "Views"]} rows={d.topViewed.map((a) => [a.question, String(a.views)])} empty="No views yet" />
        <Table title="Most searched" head={["Term", "Count"]} rows={d.topSearches.map((s) => [s.term, String(s.count)])} empty="No searches yet" />
        <Table title="Unanswered searches" head={["Term", "Count"]} rows={d.unanswered.map((s) => [s.term, String(s.count)])} empty="None — great coverage!" />
      </div>
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
          {rows.map((r, i) => <tr key={i} className="border-t border-mint-soft/60">{r.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? "text-ink-2" : "font-semibold text-forest"}`}>{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
