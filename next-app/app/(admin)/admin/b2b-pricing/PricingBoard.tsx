"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BusinessRow } from "@/lib/b2b/dashboard-types";
import type { PricingRow, PricingListResponse, PricingDetailResponse, PricingProduct, PricingReports } from "@/lib/b2b/pricing-types";

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

type Tab = "dashboard" | "pricing" | "add" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" }, { key: "pricing", label: "Pricing" }, { key: "add", label: "Add Pricing" }, { key: "reports", label: "Reports" },
];

export function PricingBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "pricing" && <PricingTab flash={flash} />}
      {tab === "add" && <AddPricingTab flash={flash} onDone={() => setTab("pricing")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-mint-soft bg-white p-5"><div className="font-display text-2xl font-bold text-leaf-600">{value}</div><div className="mt-1 text-sm text-ink-3">{label}</div></div>;
}

/* ===================== Dashboard ===================== */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [r, setR] = useState<PricingReports | null>(null);
  useEffect(() => { api("/api/b2b/pricing/reports").then((j) => setR(j)).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!r) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pricing rules" value={String(r.totalRules)} />
        <Kpi label="Active rules" value={String(r.activeRules)} />
        <Kpi label="Businesses covered" value={String(r.businessesCovered)} />
        <Kpi label="Avg. discount" value={pct(r.avgDiscountBps)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportTable title="Top businesses by rules" head={["Business", "Rules", "Avg B2B price"]} rows={r.byBusiness.map((b) => [`${b.code ?? ""} ${b.name ?? ""}`.trim() || "—", String(b.rules), inr(b.avgB2bPaise)])} />
        <ReportTable title="By product" head={["Product", "Rules", "Avg B2B", "Avg base"]} rows={r.byProduct.map((p) => [p.name, String(p.rules), inr(p.avgB2bPaise), inr(p.avgBasePaise)])} />
      </div>
    </div>
  );
}

/* ===================== Pricing list ===================== */
const PAGE = 20;
function PricingTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [active, setActive] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(0);
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [data, setData] = useState<PricingListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { api("/api/b2b/pricing/products").then((j) => setProducts(j.products)).catch(() => {}); }, []);
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (productSlug) p.set("productSlug", productSlug);
    if (active) p.set("active", active);
    if (priceFrom) p.set("priceFrom", priceFrom);
    if (priceTo) p.set("priceTo", priceTo);
    if (includeDeleted) p.set("includeDeleted", "1");
    p.set("sort", sort); p.set("limit", String(PAGE)); p.set("offset", String(page * PAGE));
    return `/api/b2b/pricing?${p}`;
  }, [q, productSlug, active, priceFrom, priceTo, includeDeleted, sort, page]);
  const load = useCallback(async () => { try { setData(await api(url)); setError(null); } catch (e) { setError((e as Error).message); } }, [url]);
  useEffect(() => { load(); }, [load]);
  const reset = () => setPage(0);

  const rows = data?.pricing ?? [];
  const total = data?.total ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search pricing ID, business or product…" className="min-w-[240px] flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
        <select value={productSlug} onChange={(e) => { setProductSlug(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-2 text-sm"><option value="">All products</option>{products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
        <select value={active} onChange={(e) => { setActive(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-2 text-sm">{[["", "Any status"], ["1", "Active"], ["0", "Inactive"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-2 text-sm">
          <option value="updated">Latest updated</option><option value="business">Business name</option><option value="product">Product</option><option value="price_desc">Highest price</option><option value="price_asc">Lowest price</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="font-semibold uppercase tracking-wide">B2B price ₹</span>
        <input value={priceFrom} onChange={(e) => { setPriceFrom(e.target.value); reset(); }} placeholder="min" inputMode="decimal" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        <span>–</span>
        <input value={priceTo} onChange={(e) => { setPriceTo(e.target.value); reset(); }} placeholder="max" inputMode="decimal" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        <label className="ml-2 flex items-center gap-1.5"><input type="checkbox" checked={includeDeleted} onChange={(e) => { setIncludeDeleted(e.target.checked); reset(); }} /> Show deleted</label>
        {(q || productSlug || active || priceFrom || priceTo || includeDeleted) && <button onClick={() => { setQ(""); setProductSlug(""); setActive(""); setPriceFrom(""); setPriceTo(""); setIncludeDeleted(false); reset(); }} className="text-leaf-600 underline">Clear</button>}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Pricing ID", "Business", "Product", "Unit", "Base", "B2B", "Disc.", "GST", "Effective", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((p) => <PricingRowView key={p.id} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} flash={flash} onChanged={load} />)}
            {!rows.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-ink-3">No pricing rules found. Use “Add Pricing” to create one.</td></tr>}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm text-ink-3">
          <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 text-xs font-semibold text-forest disabled:opacity-40">← Prev</button>
            <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 text-xs font-semibold text-forest disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ p }: { p: PricingRow }) {
  if (p.deleted) return <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-500">Deleted</span>;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.active ? "bg-leaf text-white" : "bg-amber-50 text-amber-700"}`}>{p.active ? "Active" : "Inactive"}</span>;
}

function PricingRowView({ p, open, onToggle, flash, onChanged }: { p: PricingRow; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<PricingDetailResponse["pricing"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [b2b, setB2b] = useState(String(p.b2bPricePaise / 100));
  const [gst, setGst] = useState(String(p.gstBps / 100));
  const [until, setUntil] = useState(p.effectiveUntil ? p.effectiveUntil.slice(0, 10) : "");
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) api(`/api/b2b/pricing/${p.id}`).then((j) => setDetail(j.pricing)).catch((e) => flash((e as Error).message)); else setDetail(null); }, [open, p.id, flash]);

  async function act(action: string, ok: string, patch?: unknown) {
    if (action === "delete" && !confirm("Soft-delete this pricing rule? It can be restored.")) return;
    setBusy(true);
    try { await api(`/api/b2b/pricing/${p.id}`, { method: "PATCH", body: JSON.stringify({ action, patch }) }); flash(ok); onChanged(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/b2b/pricing/${p.id}`, { method: "PATCH", body: JSON.stringify({ action: "update", patch: { b2bPricePaise: Math.round(Number(b2b) * 100), gstBps: Math.round(Number(gst) * 100), effectiveUntil: until ? new Date(until).toISOString() : null, reason: reason || undefined } }) });
      flash("Pricing updated"); setReason(""); onChanged();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <tr className="border-b border-mint-soft/60 hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-mono text-xs font-semibold text-forest">{p.code}</td>
        <td className="px-4 py-3"><div className="font-semibold text-forest">{p.businessName}</div><div className="text-xs text-ink-3">{p.businessCode}</div></td>
        <td className="px-4 py-3 text-ink-2">{p.productName}{p.variantLabel ? ` · ${p.variantLabel}` : ""}{p.minQty > 1 ? ` · ≥${p.minQty}` : ""}</td>
        <td className="px-4 py-3 text-ink-2">{p.unit}</td>
        <td className="px-4 py-3 text-ink-3">{inr(p.basePricePaise)}</td>
        <td className="px-4 py-3 font-semibold text-forest">{inr(p.b2bPricePaise)}</td>
        <td className="px-4 py-3 text-leaf-600">{pct(p.discountBps)}</td>
        <td className="px-4 py-3 text-ink-2">{pct(p.gstBps)}</td>
        <td className="px-4 py-3 text-xs text-ink-3">{fmtDate(p.effectiveFrom)}{p.effectiveUntil ? ` → ${fmtDate(p.effectiveUntil)}` : ""}</td>
        <td className="px-4 py-3"><StatusPill p={p} /></td>
        <td className="px-4 py-3 text-right"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]"><td colSpan={11} className="px-4 py-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Edit pricing</p>
              {!p.deleted ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-ink-3">B2B price (₹)<input value={b2b} onChange={(e) => setB2b(e.target.value)} inputMode="decimal" className={`${inp} mt-1`} /></label>
                  <label className="text-xs text-ink-3">GST %<input value={gst} onChange={(e) => setGst(e.target.value)} inputMode="decimal" className={`${inp} mt-1`} /></label>
                  <label className="text-xs text-ink-3">Effective until<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inp} mt-1`} /></label>
                  <label className="text-xs text-ink-3">Reason (optional)<input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inp} mt-1`} placeholder="Renegotiated" /></label>
                  <p className="col-span-2 text-sm text-ink-2">New discount: <b className="text-leaf-600">{pct(p.basePricePaise > 0 ? Math.round(((p.basePricePaise - Math.round(Number(b2b) * 100)) / p.basePricePaise) * 10000) : 0)}</b> · Effective w/ GST: <b className="text-forest">{inr(Math.round(Math.round(Number(b2b) * 100) * (1 + (Number(gst) || 0) / 100)))}</b></p>
                  <div className="col-span-2 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={saveEdit} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
                    <button disabled={busy} onClick={() => act(p.active ? "disable" : "enable", p.active ? "Disabled" : "Enabled")} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest disabled:opacity-50">{p.active ? "Disable" : "Enable"}</button>
                    <button disabled={busy} onClick={() => act("delete", "Pricing deleted")} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              ) : (
                <div><p className="text-sm text-ink-3">This rule is soft-deleted.</p><button disabled={busy} onClick={() => act("restore", "Pricing restored")} className="mt-2 rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Restore</button></div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Change history (audit)</p>
              {detail ? (
                <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                  {detail.history.map((h) => (
                    <li key={h.id} className="rounded-lg border border-mint-soft bg-white px-3 py-2 text-xs">
                      <div className="flex items-center justify-between"><span className="font-semibold text-forest">{h.action[0].toUpperCase() + h.action.slice(1)}{h.byRole ? ` · ${h.byRole}` : ""}</span><span className="text-ink-3">{new Date(h.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                      {h.oldB2bPaise != null && h.oldB2bPaise !== h.newB2bPaise && <p className="text-ink-2">Price: {inr(h.oldB2bPaise)} → <b>{inr(h.newB2bPaise)}</b></p>}
                      {h.reason && <p className="italic text-ink-3">{h.reason}</p>}
                    </li>
                  ))}
                  {!detail.history.length && <p className="text-xs text-ink-3">No changes recorded.</p>}
                </ol>
              ) : <p className="text-xs text-ink-3">Loading…</p>}
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ===================== Add pricing ===================== */
function AddPricingTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [bizQ, setBizQ] = useState("");
  const [matches, setMatches] = useState<BusinessRow[]>([]);
  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [slug, setSlug] = useState("");
  const [variant, setVariant] = useState("");
  const [unit, setUnit] = useState("");
  const [base, setBase] = useState("");
  const [b2b, setB2b] = useState("");
  const [gst, setGst] = useState("0");
  const [minQty, setMinQty] = useState("1");
  const [from, setFrom] = useState(todayISO());
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api("/api/b2b/pricing/products").then((j) => setProducts(j.products)).catch(() => {}); }, []);
  const product = products.find((p) => p.slug === slug);
  async function searchBiz() { try { const j = await api(`/api/b2b/businesses?q=${encodeURIComponent(bizQ.trim())}`); setMatches(j.businesses); } catch (e) { flash((e as Error).message); } }
  function pickProduct(s: string) { setSlug(s); const p = products.find((x) => x.slug === s); if (p) { setUnit(p.primaryUnit); setBase((p.basePricePaise / 100).toString()); } }

  const basePaise = Math.round((Number(base) || 0) * 100);
  const b2bPaise = Math.round((Number(b2b) || 0) * 100);
  const discountBps = basePaise > 0 ? Math.round(((basePaise - b2bPaise) / basePaise) * 10000) : 0;

  async function submit() {
    if (!biz) { setErr("Select a business"); return; }
    if (!slug) { setErr("Select a product"); return; }
    setBusy(true); setErr(null);
    try {
      await api("/api/b2b/pricing", { method: "POST", body: JSON.stringify({
        businessId: biz.id, productSlug: slug, productName: product?.name ?? slug, variantLabel: variant || undefined, unit,
        basePricePaise: basePaise, b2bPricePaise: b2bPaise, gstBps: Math.round((Number(gst) || 0) * 100), minQty: Math.round(Number(minQty) || 1),
        effectiveFrom: from ? new Date(from).toISOString() : undefined, effectiveUntil: until ? new Date(until).toISOString() : null,
      }) });
      flash("Pricing rule created"); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* business */}
      {!biz ? (
        <div className="rounded-2xl border border-mint-soft bg-white p-4">
          <p className="mb-2 text-sm font-bold text-forest">1. Select business</p>
          <div className="flex gap-2">
            <input value={bizQ} onChange={(e) => setBizQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchBiz()} placeholder="Business ID / name / mobile / GST" className={inp} />
            <button onClick={searchBiz} className="shrink-0 rounded-full border border-mint-soft px-4 text-sm font-semibold text-forest hover:border-leaf">Find</button>
          </div>
          {matches.length > 0 && <div className="mt-2 divide-y divide-mint-soft rounded-xl border border-mint-soft">{matches.map((m) => <button key={m.id} onClick={() => { setBiz(m); setMatches([]); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-mint-soft/40"><span><b className="text-forest">{m.code}</b> · {m.name}</span><span className="text-ink-3">{m.mobile}</span></button>)}</div>}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-leaf bg-mint-soft px-4 py-3 text-sm">
          <div><b className="text-forest">{biz.code} · {biz.name}</b><div className="text-ink-2">Default discount {(biz.discountBps / 100).toFixed(2)}%</div></div>
          <button onClick={() => setBiz(null)} className="text-xs font-semibold text-leaf-600 underline">Change</button>
        </div>
      )}

      <div className="rounded-2xl border border-mint-soft bg-white p-4">
        <p className="mb-3 text-sm font-bold text-forest">2. Product & price</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-ink-3">Product *<select value={slug} onChange={(e) => pickProduct(e.target.value)} className={`${inp} mt-1`}><option value="">Select…</option>{products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
          <label className="text-xs text-ink-3">Unit *<select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inp} mt-1`}>{(product?.units ?? []).map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
          <label className="text-xs text-ink-3">Variant (optional)<input value={variant} onChange={(e) => setVariant(e.target.value)} className={`${inp} mt-1`} placeholder="e.g. 1 L bottle" /></label>
          <label className="text-xs text-ink-3">Min quantity (slab)<input value={minQty} onChange={(e) => setMinQty(e.target.value)} inputMode="numeric" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink-3">Base price (₹) *<input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink-3">B2B price (₹) *<input value={b2b} onChange={(e) => setB2b(e.target.value)} inputMode="decimal" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink-3">GST %<input value={gst} onChange={(e) => setGst(e.target.value)} inputMode="decimal" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink-3">Effective from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink-3">Effective until (optional)<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inp} mt-1`} /></label>
        </div>
        <div className="mt-3 rounded-xl bg-[#F6FAF6] px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-2">Discount vs base</span><span className={`font-bold ${discountBps < 0 ? "text-red-600" : "text-leaf-600"}`}>{pct(discountBps)}</span></div>
          <div className="flex justify-between"><span className="text-ink-2">Effective price (pre-GST)</span><span className="font-semibold text-forest">{inr(b2bPaise)}</span></div>
          <div className="flex justify-between"><span className="text-ink-2">Effective price (incl. GST)</span><span className="font-bold text-forest">{inr(Math.round(b2bPaise * (1 + (Number(gst) || 0) / 100)))}</span></div>
        </div>
      </div>

      {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
      <button disabled={busy || !biz || !slug} onClick={submit} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create pricing rule"}</button>
    </div>
  );
}

/* ===================== Reports ===================== */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [r, setR] = useState<PricingReports | null>(null);
  useEffect(() => { api("/api/b2b/pricing/reports").then((j) => setR(j)).catch((e) => flash((e as Error).message)); }, [flash]);
  function exportCsv() {
    if (!r) return;
    const lines: (string | number)[][] = [
      ["B2B Pricing Report"], ["Total rules", r.totalRules], ["Active rules", r.activeRules], ["Businesses covered", r.businessesCovered], ["Avg discount", pct(r.avgDiscountBps)], [],
      ["By business"], ["Business ID", "Name", "Rules", "Avg B2B (₹)"], ...r.byBusiness.map((b) => [b.code ?? "", b.name ?? "", b.rules, (b.avgB2bPaise / 100).toFixed(2)]), [],
      ["By product"], ["Product", "Rules", "Avg B2B (₹)", "Avg base (₹)"], ...r.byProduct.map((p) => [p.name, p.rules, (p.avgB2bPaise / 100).toFixed(2), (p.avgBasePaise / 100).toFixed(2)]),
    ];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `b2b-pricing-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }
  if (!r) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button onClick={exportCsv} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">Export CSV</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Pricing rules" value={String(r.totalRules)} /><Kpi label="Active" value={String(r.activeRules)} /><Kpi label="Businesses" value={String(r.businessesCovered)} /><Kpi label="Avg discount" value={pct(r.avgDiscountBps)} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportTable title="Business-wise pricing" head={["Business", "Rules", "Avg B2B"]} rows={r.byBusiness.map((b) => [`${b.code ?? ""} ${b.name ?? ""}`.trim() || "—", String(b.rules), inr(b.avgB2bPaise)])} />
        <ReportTable title="Product-wise pricing" head={["Product", "Rules", "Avg B2B", "Avg base"]} rows={r.byProduct.map((p) => [p.name, String(p.rules), inr(p.avgB2bPaise), inr(p.avgBasePaise)])} />
      </div>
    </div>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-mint-soft bg-white">
      <p className="border-b border-mint-soft bg-[#F6FAF6] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-ink-3"><tr>{head.map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-mint-soft/60">{row.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? "text-ink-2" : "text-forest"}`}>{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">No data</td></tr>}</tbody>
      </table>
    </div>
  );
}
