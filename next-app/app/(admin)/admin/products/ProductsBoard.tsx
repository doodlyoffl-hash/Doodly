"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductListItem, ProductListResponse, ProductStats, ProductDetail, ProductReports, VariantRow } from "@/lib/products/types";

/* ---------- helpers ---------- */
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const sel = "rounded-lg border border-mint-soft bg-white px-3 py-2 text-sm outline-none focus:border-leaf";
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm outline-none focus:border-leaf";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

const STATUSES = ["AVAILABLE", "DRAFT", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED", "HIDDEN"];
const ST_TONE: Record<string, string> = { AVAILABLE: "bg-leaf text-white", DRAFT: "bg-gray-100 text-gray-500", COMING_SOON: "bg-blue-50 text-blue-700", OUT_OF_STOCK: "bg-red-50 text-red-700", DISCONTINUED: "bg-gray-100 text-gray-500", HIDDEN: "bg-amber-50 text-amber-700", ARCHIVED: "bg-gray-100 text-gray-400" };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ST_TONE[s] ?? "bg-gray-100 text-gray-600"}`}>{s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-mint-soft bg-white p-5"><div className="font-display text-2xl font-bold text-leaf-600">{value}</div><div className="mt-1 text-sm text-ink-3">{label}</div>{sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}</div>
);
function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="rounded-2xl border border-mint-soft bg-white p-4"><div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h4>{right}</div>{children}</div>;
}

type Tab = "dashboard" | "products" | "create" | "reports";
const TABS: { key: Tab; label: string }[] = [{ key: "dashboard", label: "Dashboard" }, { key: "products", label: "Products" }, { key: "create", label: "Create" }, { key: "reports", label: "Reports" }];

export function ProductsBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>)}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "products" && <ProductsTab flash={flash} />}
      {tab === "create" && <CreateTab flash={flash} onDone={() => setTab("products")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================= Dashboard ============================= */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<ProductStats | null>(null);
  useEffect(() => { api("/api/admin/products/stats").then(setS).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!s) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total products" value={String(s.total)} />
      <Kpi label="Active" value={String(s.active)} />
      <Kpi label="Inactive" value={String(s.inactive)} />
      <Kpi label="Draft" value={String(s.draft)} />
      <Kpi label="Coming soon" value={String(s.comingSoon)} />
      <Kpi label="Featured" value={String(s.featured)} />
      <Kpi label="Out of stock" value={String(s.outOfStock)} />
      <Kpi label="Low stock" value={String(s.lowStock)} />
      <Kpi label="Total stock value" value={inr(s.totalStockValuePaise)} sub="Σ selling × stock" />
    </div>
  );
}

/* ============================= Products list ============================= */
function ProductsTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [featured, setFeatured] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (featured) p.set("featured", featured);
    if (stock) p.set("stock", stock);
    if (category) p.set("category", category);
    p.set("sort", sort); p.set("page", String(page)); p.set("pageSize", "15");
    return `/api/admin/products?${p.toString()}`;
  }, [q, status, featured, stock, category, sort, page]);

  const reload = useCallback(() => { setError(null); api(url).then(setData).catch((e) => setError((e as Error).message)); }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, status, featured, stock, category, sort]);

  const rows = data?.products ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); allChecked ? rows.forEach((r) => n.delete(r.id)) : rows.forEach((r) => n.add(r.id)); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function exportCsv() {
    const list = rows.filter((r) => selected.has(r.id)).length ? rows.filter((r) => selected.has(r.id)) : rows;
    const head = ["Slug", "Name", "Category", "SKU", "Status", "Featured", "MRP", "Selling", "Discount%", "GST%", "Stock", "Reserved", "Available", "Visible", "Updated"];
    const lines = [head, ...list.map((p) => [p.slug, p.name, p.category ?? "", p.sku ?? "", p.status, p.featured ? "Yes" : "No", String(Math.round((p.mrpPaise ?? 0) / 100)), String(Math.round((p.sellingPaise ?? 0) / 100)), String(Math.round(p.discountBps / 100)), String(Math.round(p.taxBps / 100)), String(p.stock), String(p.reservedStock), String(p.availableStock), p.visible ? "Yes" : "No", p.updatedAt.slice(0, 10)])];
    const csv = lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `products-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }
  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    const ids = [...selected]; if (!ids.length) return;
    if (action === "delete" && !confirm(`Soft-delete ${ids.length} product(s)?`)) return;
    try { const r = await api("/api/admin/products/bulk", { method: "POST", body: JSON.stringify({ ids, action, ...extra }) }); flash(`${r.result.count} product(s) — ${action}`); setSelected(new Set()); reload(); }
    catch (e) { flash((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, slug, SKU, category…" className={`${sel} min-w-[240px] flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="">All statuses</option>{[...STATUSES, "ARCHIVED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select>
        <select value={stock} onChange={(e) => setStock(e.target.value)} className={sel}><option value="">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
        <select value={featured} onChange={(e) => setFeatured(e.target.value)} className={sel}><option value="">All</option><option value="1">Featured</option></select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel}><option value="">All categories</option>{facets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}><option value="created">Newest</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="price">Highest price</option><option value="stock">Stock qty</option></select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-leaf/30 bg-leaf/5 px-4 py-2 text-sm">
          <b className="text-forest">{selected.size} selected</b>
          <button onClick={() => bulk("activate")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Activate</button>
          <button onClick={() => bulk("deactivate")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Deactivate</button>
          <BulkCategory cats={facets?.categories ?? []} onApply={(id) => bulk("category", { categoryId: id })} />
          <BulkStock onApply={(stock) => bulk("stock", { stock })} />
          <button onClick={() => bulk("delete")} className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600">Delete</button>
          <button onClick={exportCsv} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Export CSV</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-ink-3 underline">clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr><th className="px-3 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              {["Product", "Category", "Price", "GST/Disc", "Stock", "Variants", "Status", "Updated", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-ink-3">No products match these filters.</td></tr>}
            {rows.map((p) => <Row key={p.id} p={p} checked={selected.has(p.id)} onCheck={() => toggle(p.id)} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} flash={flash} onChanged={reload} />)}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{total} product{total === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
          <button disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}

function Row({ p, checked, onCheck, open, onToggle, flash, onChanged }: { p: ProductListItem; checked: boolean; onCheck: () => void; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-b border-mint-soft/60 align-top">
        <td className="px-3 py-3"><input type="checkbox" checked={checked} onChange={onCheck} /></td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-lg border border-mint-soft object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-mint-soft bg-[#F6FAF6] text-xs text-ink-3">—</div>}
            <div><div className="font-semibold text-forest">{p.name}{p.featured ? " ★" : ""}</div><div className="font-mono text-xs text-ink-3">{p.slug}{p.sku ? ` · ${p.sku}` : ""}</div></div>
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-ink-2">{p.category ?? "—"}</td>
        <td className="px-3 py-3"><div className="font-semibold text-forest">{p.sellingPaise != null ? inr(p.sellingPaise) : "—"}</div>{p.mrpPaise != null && p.mrpPaise !== p.sellingPaise ? <div className="text-xs text-ink-3 line-through">{inr(p.mrpPaise)}</div> : null}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{pct(p.taxBps)} / {pct(p.discountBps)}</td>
        <td className="px-3 py-3 text-xs"><span className={p.outOfStock ? "font-bold text-red-600" : p.lowStock ? "font-bold text-amber-700" : "text-ink-2"}>{p.stock}</span><div className="text-ink-3">{p.reservedStock > 0 ? `${p.availableStock} avail` : ""}</div></td>
        <td className="px-3 py-3 text-ink-2">{p.variantCount}</td>
        <td className="px-3 py-3"><Pill s={p.status} /></td>
        <td className="px-3 py-3 text-xs text-ink-3">{fmtDate(p.updatedAt)}{p.updatedBy ? <div>by {p.updatedBy}</div> : null}</td>
        <td className="px-3 py-3"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:bg-[#F6FAF6]">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && <tr><td colSpan={10} className="bg-[#FAFCF9] px-3 py-4"><DetailPanel id={p.id} flash={flash} onChanged={onChanged} /></td></tr>}
    </>
  );
}

/* ============================= Detail / edit ============================= */
function DetailPanel({ id, flash, onChanged }: { id: string; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<ProductDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api(`/api/admin/products/${id}`).then((r) => setD(r.product)).catch((e) => flash((e as Error).message)); }, [id, flash]);
  useEffect(() => { load(); }, [load]);

  async function mutate(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try { await api(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); onChanged(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  if (!d) return <p className="text-sm text-ink-3">Loading product…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* left: core + status + images */}
      <div className="space-y-3">
        <Card title="Details" right={<Pill s={d.status} />}>
          <CoreEdit d={d} busy={busy} onSave={(p) => mutate({ action: "update", ...p }, "Product updated")} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={d.status} onChange={(e) => mutate({ action: "status", status: e.target.value }, "Status changed")} className="rounded-lg border border-mint-soft px-2 py-1 text-xs">{[...STATUSES, "ARCHIVED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.featured} onChange={(e) => mutate({ action: "feature", featured: e.target.checked }, "Featured updated")} /> Featured</label>
            {d.deletedAt ? <button onClick={() => mutate({ action: "restore" }, "Restored")} className="rounded-full border border-mint-soft px-2 py-0.5 text-xs font-semibold text-forest">Restore</button> : null}
          </div>
        </Card>
        <Card title="Images" right={<AddImage busy={busy} onAdd={(url, alt) => mutate({ action: "add-image", url, alt }, "Image added")} />}>
          {d.images.length === 0 ? <p className="text-xs text-ink-3">No images. Add a hosted image URL (CDN / Cloudinary).</p> : (
            <div className="flex flex-wrap gap-2">
              {d.images.map((img, i) => (
                <div key={img.id} className="relative">
                  <img src={img.url} alt={img.alt ?? ""} className={`h-16 w-16 rounded-lg border-2 object-cover ${img.isFeatured ? "border-leaf" : "border-mint-soft"}`} />
                  <div className="mt-0.5 flex gap-1 text-[10px]">
                    {!img.isFeatured && <button onClick={() => mutate({ action: "set-featured-image", imageId: img.id }, "Featured image set")} className="text-leaf-600">★</button>}
                    {i > 0 && <button onClick={() => mutate({ action: "reorder-images", imageIds: move(d.images.map((x) => x.id), i, i - 1) }, "Reordered")} className="text-ink-3">←</button>}
                    {i < d.images.length - 1 && <button onClick={() => mutate({ action: "reorder-images", imageIds: move(d.images.map((x) => x.id), i, i + 1) }, "Reordered")} className="text-ink-3">→</button>}
                    <button onClick={() => mutate({ action: "delete-image", imageId: img.id }, "Image deleted")} className="text-red-600">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Inventory">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-[#F6FAF6] p-2"><div className="font-bold text-forest">{d.inventory.stock}</div><div className="text-ink-3">stock</div></div>
            <div className="rounded-lg bg-[#F6FAF6] p-2"><div className="font-bold text-forest">{d.inventory.reserved}</div><div className="text-ink-3">reserved</div></div>
            <div className="rounded-lg bg-[#F6FAF6] p-2"><div className={`font-bold ${d.inventory.available <= 0 ? "text-red-600" : "text-forest"}`}>{d.inventory.available}</div><div className="text-ink-3">available</div></div>
          </div>
          {d.inventory.lowStock && <p className="mt-1 text-xs font-semibold text-amber-700">⚠ Low stock</p>}
          {d.inventory.outOfStock && <p className="mt-1 text-xs font-semibold text-red-600">⚠ Out of stock</p>}
        </Card>
      </div>

      {/* middle: pricing + variants */}
      <div className="space-y-3">
        <Card title="Pricing & GST"><PricingEdit d={d} busy={busy} onSave={(p) => mutate({ action: "pricing", ...p }, "Pricing updated")} /></Card>
        <Card title="Variants" right={<AddVariant busy={busy} onAdd={(v) => mutate({ action: "add-variant", ...v }, "Variant added")} />}>
          {d.variants.length === 0 ? <p className="text-xs text-ink-3">No variants.</p> : d.variants.map((v) => <VariantRowEdit key={v.id} v={v} busy={busy} onSave={(p) => mutate({ action: "update-variant", variantId: v.id, ...p }, "Variant updated")} onDelete={() => mutate({ action: "delete-variant", variantId: v.id }, "Variant deleted")} />)}
        </Card>
      </div>

      {/* right: SEO + nutrition/quality + timeline */}
      <div className="space-y-3">
        <Card title="SEO"><SeoEdit d={d} busy={busy} onSave={(p) => mutate({ action: "seo", ...p }, "SEO updated")} /></Card>
        <Card title="Nutrition & quality"><SpecsEdit d={d} busy={busy} onNutrition={(p) => mutate({ action: "nutrition", ...p }, "Nutrition updated")} onQuality={(p) => mutate({ action: "quality", ...p }, "Quality updated")} /></Card>
        <Card title="Timeline">
          <ol className="max-h-48 space-y-2 overflow-auto">
            {d.events.length === 0 && <li className="text-xs text-ink-3">No events.</li>}
            {d.events.map((e) => <li key={e.id} className="border-l-2 border-mint-soft pl-3 text-xs"><div className="font-semibold text-forest">{e.summary}</div><div className="text-ink-3">{fmtDT(e.createdAt)}{e.byRole ? ` · ${e.byRole}` : ""}</div></li>)}
          </ol>
        </Card>
      </div>
    </div>
  );
}
function move(arr: string[], from: number, to: number) { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; }

function CoreEdit({ d, busy, onSave }: { d: ProductDetail; busy: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const [name, setName] = useState(d.name); const [desc, setDesc] = useState(d.description); const [longDesc, setLongDesc] = useState(d.longDesc ?? "");
  const [tags, setTags] = useState(d.tags.join(", ")); const [imageUrl, setImageUrl] = useState(d.imageUrl ?? ""); const [visible, setVisible] = useState(d.visible);
  return (
    <div className="space-y-1 text-xs">
      <p className="font-mono text-ink-3">{d.slug}</p>
      <label className="block">Name<input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></label>
      <label className="block">Short description<input value={desc} onChange={(e) => setDesc(e.target.value)} className={inp} /></label>
      <label className="block">Long description<textarea value={longDesc} onChange={(e) => setLongDesc(e.target.value)} rows={2} className={inp} /></label>
      <label className="block">Featured image URL<input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inp} /></label>
      <label className="block">Tags (comma)<input value={tags} onChange={(e) => setTags(e.target.value)} className={inp} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible in storefront</label>
      <button disabled={busy} onClick={() => onSave({ name, description: desc, longDesc, imageUrl: imageUrl || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), visible })} className="rounded-full bg-leaf px-4 py-1.5 font-semibold text-white disabled:opacity-50">Save details</button>
    </div>
  );
}
function PricingEdit({ d, busy, onSave }: { d: ProductDetail; busy: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const r = (paise: number | null | undefined) => (paise != null ? String(Math.round(paise / 100)) : "");
  const [mrp, setMrp] = useState(r(d.pricing?.mrpPaise)); const [selling, setSelling] = useState(r(d.pricing?.sellingPaise));
  const [discount, setDiscount] = useState(String((d.pricing?.discountBps ?? 0) / 100)); const [gst, setGst] = useState(String((d.pricing?.taxBps ?? 0) / 100));
  const [deposit, setDeposit] = useState(r(d.pricing?.depositPaise));
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <label className="block">MRP ₹<input value={mrp} onChange={(e) => setMrp(e.target.value)} className={inp} /></label>
      <label className="block">Selling ₹<input value={selling} onChange={(e) => setSelling(e.target.value)} className={inp} /></label>
      <label className="block">Discount %<input value={discount} onChange={(e) => setDiscount(e.target.value)} className={inp} /></label>
      <label className="block">GST %<input value={gst} onChange={(e) => setGst(e.target.value)} className={inp} /></label>
      <label className="block">Deposit ₹<input value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inp} /></label>
      <div className="flex items-end"><button disabled={busy} onClick={() => onSave({ mrpPaise: Math.round(Number(mrp || 0) * 100), sellingPaise: Math.round(Number(selling || 0) * 100), discountBps: Math.round(Number(discount || 0) * 100), taxBps: Math.round(Number(gst || 0) * 100), depositPaise: Math.round(Number(deposit || 0) * 100) })} className="w-full rounded-full bg-leaf px-3 py-1.5 font-semibold text-white disabled:opacity-50">Save</button></div>
    </div>
  );
}
function VariantRowEdit({ v, busy, onSave, onDelete }: { v: VariantRow; busy: boolean; onSave: (p: Record<string, unknown>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [stock, setStock] = useState(String(v.stock)); const [sku, setSku] = useState(v.sku ?? ""); const [barcode, setBarcode] = useState(v.barcode ?? "");
  const [daily, setDaily] = useState(v.dailyPaise != null ? String(Math.round(v.dailyPaise / 100)) : ""); const [active, setActive] = useState(v.active);
  return (
    <div className="mb-1 rounded-lg border border-mint-soft p-2 text-xs">
      <div className="flex items-center justify-between">
        <b className="text-forest">{v.label} · {v.ml}ml · {v.type.toLowerCase()}</b>
        <span className="flex items-center gap-2"><span className={v.stock <= 0 ? "text-red-600" : v.stock <= v.lowStockThreshold ? "text-amber-700" : "text-ink-2"}>{v.stock} in</span><button onClick={() => setOpen(!open)} className="text-leaf-600">{open ? "close" : "edit"}</button></span>
      </div>
      {open && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          <label className="block">Stock<input value={stock} onChange={(e) => setStock(e.target.value)} className={inp} /></label>
          <label className="block">{v.type === "TRIAL" ? "Trial ₹" : "Daily ₹"}<input value={daily} onChange={(e) => setDaily(e.target.value)} className={inp} /></label>
          <label className="block">SKU<input value={sku} onChange={(e) => setSku(e.target.value)} className={inp} /></label>
          <label className="block">Barcode<input value={barcode} onChange={(e) => setBarcode(e.target.value)} className={inp} /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          <div className="flex gap-1">
            <button disabled={busy} onClick={() => onSave({ stock: Math.max(0, Number(stock || 0)), sku: sku || undefined, barcode: barcode || undefined, ...(v.type === "TRIAL" ? { fixedPaise: Math.round(Number(daily || 0) * 100) } : { dailyPaise: Math.round(Number(daily || 0) * 100) }), active })} className="rounded-full bg-leaf px-3 py-1 font-semibold text-white">Save</button>
            <button onClick={onDelete} className="text-red-600">delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
function SeoEdit({ d, busy, onSave }: { d: ProductDetail; busy: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(d.seo?.metaTitle ?? ""); const [desc, setDesc] = useState(d.seo?.metaDescription ?? "");
  const [og, setOg] = useState(d.seo?.ogImageUrl ?? ""); const [canonical, setCanonical] = useState(d.seo?.canonicalUrl ?? ""); const [kw, setKw] = useState((d.seo?.keywords ?? []).join(", "));
  return (
    <div className="space-y-1 text-xs">
      <p className="text-ink-3">Slug: <span className="font-mono">/{d.slug}</span></p>
      <label className="block">Meta title<input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} /></label>
      <label className="block">Meta description<textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inp} /></label>
      <label className="block">OG image URL<input value={og} onChange={(e) => setOg(e.target.value)} className={inp} /></label>
      <label className="block">Canonical URL<input value={canonical} onChange={(e) => setCanonical(e.target.value)} className={inp} /></label>
      <label className="block">Keywords (comma)<input value={kw} onChange={(e) => setKw(e.target.value)} className={inp} /></label>
      <button disabled={busy} onClick={() => onSave({ metaTitle: title, metaDescription: desc, ogImageUrl: og, canonicalUrl: canonical, keywords: kw.split(",").map((k) => k.trim()).filter(Boolean) })} className="rounded-full bg-leaf px-4 py-1.5 font-semibold text-white disabled:opacity-50">Save SEO</button>
    </div>
  );
}
function SpecsEdit({ d, busy, onNutrition, onQuality }: { d: ProductDetail; busy: boolean; onNutrition: (p: Record<string, unknown>) => void; onQuality: (p: Record<string, unknown>) => void }) {
  const [fat, setFat] = useState(d.nutrition?.fat ?? ""); const [protein, setProtein] = useState(d.nutrition?.protein ?? ""); const [energy, setEnergy] = useState(d.nutrition?.energy ?? "");
  const [qFat, setQFat] = useState(d.quality?.fatPct ?? ""); const [snf, setSnf] = useState(d.quality?.snf ?? ""); const [expiry, setExpiry] = useState(d.quality?.expiry ?? "");
  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-3 gap-1">
        <label className="block">Fat<input value={fat} onChange={(e) => setFat(e.target.value)} className={inp} /></label>
        <label className="block">Protein<input value={protein} onChange={(e) => setProtein(e.target.value)} className={inp} /></label>
        <label className="block">Energy<input value={energy} onChange={(e) => setEnergy(e.target.value)} className={inp} /></label>
      </div>
      <button disabled={busy} onClick={() => onNutrition({ fat, protein, energy })} className="rounded-full border border-mint-soft px-3 py-1 font-semibold text-forest">Save nutrition</button>
      <div className="grid grid-cols-3 gap-1 border-t border-mint-soft pt-2">
        <label className="block">Fat %<input value={qFat} onChange={(e) => setQFat(e.target.value)} className={inp} /></label>
        <label className="block">SNF<input value={snf} onChange={(e) => setSnf(e.target.value)} className={inp} /></label>
        <label className="block">Shelf life<input value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inp} /></label>
      </div>
      <button disabled={busy} onClick={() => onQuality({ fatPct: qFat, snf, expiry })} className="rounded-full border border-mint-soft px-3 py-1 font-semibold text-forest">Save quality</button>
    </div>
  );
}
function AddImage({ busy, onAdd }: { busy: boolean; onAdd: (url: string, alt?: string) => void }) {
  const [open, setOpen] = useState(false); const [url, setUrl] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-2.5 py-1 text-[11px] font-semibold text-forest">+ Add URL</button>;
  return <span className="flex items-center gap-1"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-40 rounded border border-mint-soft px-2 py-1 text-xs" /><button disabled={busy || !url.trim()} onClick={() => { onAdd(url.trim()); setOpen(false); setUrl(""); }} className="rounded-full bg-forest px-2 py-1 text-[11px] font-semibold text-white">Add</button></span>;
}
function AddVariant({ busy, onAdd }: { busy: boolean; onAdd: (v: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false); const [label, setLabel] = useState(""); const [ml, setMl] = useState(""); const [type, setType] = useState("SUBSCRIPTION"); const [price, setPrice] = useState(""); const [stock, setStock] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-2.5 py-1 text-[11px] font-semibold text-forest">+ Variant</button>;
  return (
    <div className="absolute right-4 z-10 mt-6 w-52 space-y-1 rounded-lg border border-mint-soft bg-white p-2 shadow-lg">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (500 ml)" className="w-full rounded border border-mint-soft px-2 py-1 text-xs" />
      <input value={ml} onChange={(e) => setMl(e.target.value)} placeholder="ml" className="w-full rounded border border-mint-soft px-2 py-1 text-xs" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded border border-mint-soft px-2 py-1 text-xs"><option value="SUBSCRIPTION">Subscription</option><option value="TRIAL">Trial</option></select>
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={type === "TRIAL" ? "trial ₹" : "daily ₹"} className="w-full rounded border border-mint-soft px-2 py-1 text-xs" />
      <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="stock" className="w-full rounded border border-mint-soft px-2 py-1 text-xs" />
      <div className="flex gap-1"><button disabled={busy || !label || !ml} onClick={() => { onAdd({ label, ml: Number(ml), type, stock: Number(stock || 0), ...(type === "TRIAL" ? { fixedPaise: Math.round(Number(price || 0) * 100) } : { dailyPaise: Math.round(Number(price || 0) * 100) }) }); setOpen(false); }} className="rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-white">Add</button><button onClick={() => setOpen(false)} className="text-xs text-ink-3">cancel</button></div>
    </div>
  );
}
function BulkCategory({ cats, onApply }: { cats: { id: string; name: string }[]; onApply: (id: string) => void }) {
  const [val, setVal] = useState("");
  return <span className="flex items-center gap-1"><select value={val} onChange={(e) => setVal(e.target.value)} className="rounded border border-mint-soft px-2 py-1 text-xs"><option value="">Set category…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{val && <button onClick={() => onApply(val)} className="rounded-full bg-forest px-2 py-1 text-[11px] font-semibold text-white">Apply</button>}</span>;
}
function BulkStock({ onApply }: { onApply: (stock: number) => void }) {
  const [val, setVal] = useState("");
  return <span className="flex items-center gap-1"><input value={val} onChange={(e) => setVal(e.target.value)} placeholder="set stock" className="w-20 rounded border border-mint-soft px-2 py-1 text-xs" />{val && <button onClick={() => onApply(Number(val))} className="rounded-full bg-forest px-2 py-1 text-[11px] font-semibold text-white">Apply</button>}</span>;
}

/* ============================= Create ============================= */
function CreateTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ slug: "", name: "", description: "", categoryId: "", status: "COMING_SOON", visible: true, featured: false, mrp: "", selling: "", gst: "", deposit: "" });
  const [vLabel, setVLabel] = useState("500 ml"); const [vMl, setVMl] = useState("500"); const [vDaily, setVDaily] = useState(""); const [vStock, setVStock] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/admin/products").then((r: ProductListResponse) => setCats(r.facets.categories)).catch(() => {}); }, []);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!f.slug || !f.name || !f.description) { flash("Slug, name and description are required."); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { slug: f.slug, name: f.name, description: f.description, categoryId: f.categoryId || undefined, status: f.status, visible: f.visible, featured: f.featured };
      if (f.selling) body.pricing = { mrpPaise: Math.round(Number(f.mrp || f.selling) * 100), sellingPaise: Math.round(Number(f.selling) * 100), taxBps: Math.round(Number(f.gst || 0) * 100), depositPaise: Math.round(Number(f.deposit || 0) * 100) };
      if (vLabel && vMl) body.variants = [{ label: vLabel, ml: Number(vMl), type: "SUBSCRIPTION", stock: Number(vStock || 0), dailyPaise: vDaily ? Math.round(Number(vDaily) * 100) : undefined }];
      await api("/api/admin/products", { method: "POST", body: JSON.stringify(body) });
      flash("Product created"); onDone();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <Card title="Product">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs">Name<input value={f.name} onChange={(e) => { set("name", e.target.value); if (!f.slug) set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} className={inp} /></label>
          <label className="block text-xs">Slug<input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="a2-buffalo-milk" className={inp} /></label>
          <label className="block text-xs sm:col-span-2">Short description<input value={f.description} onChange={(e) => set("description", e.target.value)} className={inp} /></label>
          <label className="block text-xs">Category<select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inp}><option value="">— None —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block text-xs">Status<select value={f.status} onChange={(e) => set("status", e.target.value)} className={inp}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select></label>
        </div>
        <div className="mt-2 flex gap-4 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={f.visible} onChange={(e) => set("visible", e.target.checked)} /> Visible</label><label className="flex items-center gap-1"><input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured</label></div>
      </Card>
      <Card title="Pricing (optional)">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block text-xs">MRP ₹<input value={f.mrp} onChange={(e) => set("mrp", e.target.value)} className={inp} /></label>
          <label className="block text-xs">Selling ₹<input value={f.selling} onChange={(e) => set("selling", e.target.value)} className={inp} /></label>
          <label className="block text-xs">GST %<input value={f.gst} onChange={(e) => set("gst", e.target.value)} className={inp} /></label>
          <label className="block text-xs">Deposit ₹<input value={f.deposit} onChange={(e) => set("deposit", e.target.value)} className={inp} /></label>
        </div>
      </Card>
      <Card title="First variant (optional)">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block text-xs">Label<input value={vLabel} onChange={(e) => setVLabel(e.target.value)} className={inp} /></label>
          <label className="block text-xs">ml<input value={vMl} onChange={(e) => setVMl(e.target.value)} className={inp} /></label>
          <label className="block text-xs">Daily ₹<input value={vDaily} onChange={(e) => setVDaily(e.target.value)} className={inp} /></label>
          <label className="block text-xs">Stock<input value={vStock} onChange={(e) => setVStock(e.target.value)} className={inp} /></label>
        </div>
      </Card>
      <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create product"}</button>
    </div>
  );
}

/* ============================= Reports ============================= */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [r, setR] = useState<ProductReports | null>(null);
  useEffect(() => { api("/api/admin/products/reports").then(setR).catch((e) => flash((e as Error).message)); }, [flash]);
  function exportCsv() {
    if (!r) return;
    const head = ["Slug", "Name", "Category", "Status", "SKU", "Stock", "Reserved", "Available", "MRP", "Selling", "Discount%", "GST%", "Featured", "Updated"];
    const lines = [head, ...r.rows.map((x) => [x.slug, x.name, x.category, x.status, x.sku, String(x.stock), String(x.reserved), String(x.available), String(x.mrpRupees), String(x.sellingRupees), String(x.discountPct), String(x.gstPct), x.featured, x.updated])];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `products-report-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }
  if (!r) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button onClick={exportCsv} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">Export CSV</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Available" value={String(r.availability.available)} />
        <Kpi label="Coming soon" value={String(r.availability.comingSoon)} />
        <Kpi label="Out of stock" value={String(r.availability.outOfStock)} />
        <Kpi label="Total stock value" value={inr(r.stockValuePaise)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable title="By status" head={["Status", "Count"]} rows={r.byStatus.map((x) => [x.status.replace(/_/g, " ").toLowerCase(), String(x.count)])} />
        <ReportTable title="By category" head={["Category", "Products", "Stock"]} rows={r.byCategory.map((x) => [x.category, String(x.count), String(x.stock)])} />
        <ReportTable title="Low stock" head={["Product", "Variant", "Stock", "Threshold"]} rows={r.lowStock.map((x) => [x.name, x.variant, String(x.stock), String(x.threshold)])} />
        <ReportTable title="Top sellers (paid)" head={["Product", "Units", "Revenue"]} rows={r.performance.map((x) => [x.name, String(x.units), inr(x.revenuePaise)])} />
      </div>
    </div>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="rounded-2xl border border-mint-soft bg-white">
      <h4 className="border-b border-mint-soft px-4 py-2.5 text-sm font-bold text-forest">{title}</h4>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-3"><tr>{head.map((h, i) => <th key={h} className={`px-4 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">No data.</td></tr>}
          {rows.map((row, i) => <tr key={i} className="border-t border-mint-soft/60">{row.map((c, j) => <td key={j} className={`px-4 py-2 ${j > 0 ? "text-right text-ink-2" : "font-medium text-forest"}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
