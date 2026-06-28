"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUSINESS_TYPES, BUSINESS_TYPE_LABEL, PAYMENT_TERMS, PAYMENT_TERM_LABEL,
  B2B_STATUS_LABEL, allowedNextStatus, type BusinessType, type PaymentTerm, type B2BOrderStatus,
} from "@/lib/b2b/engine";
import { B2B_PRODUCTS } from "@/lib/b2b/catalog";
import type {
  BusinessRow, OrderRow, BusinessProfileResponse, B2BReportsResponse,
} from "@/lib/b2b/dashboard-types";

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

type Tab = "businesses" | "register" | "create" | "orders" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "businesses", label: "Businesses" },
  { key: "register", label: "Register" },
  { key: "create", label: "Create Order" },
  { key: "orders", label: "Orders" },
  { key: "reports", label: "Reports" },
];

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export function B2BBoard() {
  const [tab, setTab] = useState<Tab>("businesses");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); }, []);

  // role hint (UX only — the server is the real boundary)
  const isSuperAdmin = useMemo(() => {
    if (typeof document === "undefined") return false;
    const m = document.cookie.match(/(?:^|;\s*)doodly-role=([^;]+)/);
    return (m?.[1] ?? "") === "super_admin";
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "businesses" && <BusinessesTab flash={flash} isSuperAdmin={isSuperAdmin} />}
      {tab === "register" && <RegisterTab flash={flash} onDone={() => setTab("businesses")} />}
      {tab === "create" && <CreateOrderTab flash={flash} onDone={() => setTab("orders")} />}
      {tab === "orders" && <OrdersTab flash={flash} />}
      {tab === "reports" && <ReportsTab flash={flash} />}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================ Businesses ============================ */

function BusinessesTab({ flash, isSuperAdmin }: { flash: (m: string) => void; isSuperAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api(`/api/b2b/businesses?includeInactive=1&q=${encodeURIComponent(q.trim())}`);
      setRows(j.businesses); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by Business ID, name, mobile or GST…"
          className="min-w-[260px] flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">Search</button>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Business ID", "Name", "Type", "Contact", "Mobile", "Terms", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <BusinessRowView key={b.id} b={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} flash={flash} isSuperAdmin={isSuperAdmin} onChanged={load} />
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-3">No businesses found. Use the Register tab to add one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-leaf text-white" : "bg-red-100 text-red-700"}`}>{active ? "Active" : "Inactive"}</span>;
}

function BusinessRowView({ b, open, onToggle, flash, isSuperAdmin, onChanged }: {
  b: BusinessRow; open: boolean; onToggle: () => void; flash: (m: string) => void; isSuperAdmin: boolean; onChanged: () => void;
}) {
  const [profile, setProfile] = useState<BusinessProfileResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api(`/api/b2b/businesses/${b.id}`).then(setProfile).catch((e) => flash((e as Error).message));
  }, [open, b.id, flash]);

  async function act(action: string, ok: string, patch?: unknown) {
    if (action === "delete" && !confirm("Soft-delete this business? It will be hidden but its order history is retained.")) return;
    setBusy(true);
    try { await api(`/api/b2b/businesses/${b.id}`, { method: "PATCH", body: JSON.stringify({ action, patch }) }); flash(ok); onChanged(); }
    catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <tr className="border-b border-mint-soft/60 hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-semibold text-forest">{b.code}</td>
        <td className="px-4 py-3">{b.name}</td>
        <td className="px-4 py-3 text-ink-2">{BUSINESS_TYPE_LABEL[b.type]}</td>
        <td className="px-4 py-3 text-ink-2">{b.contactPerson}</td>
        <td className="px-4 py-3 text-ink-2">{b.mobile}</td>
        <td className="px-4 py-3 text-ink-2">{PAYMENT_TERM_LABEL[b.paymentTerm]}</td>
        <td className="px-4 py-3"><StatusPill active={b.active} /></td>
        <td className="px-4 py-3 text-right"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "View"}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]"><td colSpan={8} className="px-4 py-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-1.5 text-sm text-ink-2">
              <Detail k="Address" v={`${b.line1}${b.landmark ? ", " + b.landmark : ""}, ${b.area ? b.area + ", " : ""}${b.city}, ${b.state} ${b.pincode}`} />
              <Detail k="Email" v={b.email ?? "—"} />
              <Detail k="Alt mobile" v={b.altMobile ?? "—"} />
              <Detail k="GST / PAN" v={`${b.gst ?? "—"} / ${b.pan ?? "—"}`} />
              <Detail k="Discount" v={`${(b.discountBps / 100).toFixed(2)}%`} />
              <Detail k="Credit limit" v={inr(b.creditLimitPaise)} />
              <Detail k="Preferred time" v={b.preferredTime ?? "—"} />
              <Detail k="Delivery notes" v={b.deliveryNotes ?? "—"} />
              {profile && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Kpi label="Total orders" value={String(profile.stats.totalOrders)} />
                  <Kpi label="Revenue" value={inr(profile.stats.totalRevenuePaise)} />
                  <Kpi label="Outstanding" value={inr(profile.stats.outstandingPaise)} />
                  <Kpi label="Last delivery" value={profile.stats.lastDeliveryAt ? fmtDate(profile.stats.lastDeliveryAt) : "—"} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {b.active
                  ? <button disabled={busy} onClick={() => act("disable", "Business disabled")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Disable</button>
                  : <button disabled={busy} onClick={() => act("enable", "Business enabled")} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Enable</button>}
                {isSuperAdmin && <button disabled={busy} onClick={() => act("delete", "Business deleted")} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">Delete (Super Admin)</button>}
              </div>
              {profile && (
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Preferred products</p>
                  <p className="text-sm text-ink-2">{profile.stats.preferredProducts.length ? profile.stats.preferredProducts.map((p) => `${p.name} (${p.qty})`).join(", ") : "—"}</p>
                  <p className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-ink-3">Recent orders</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {profile.orders.slice(0, 12).map((o) => (
                      <div key={o.id} className="flex items-center justify-between rounded-lg border border-mint-soft bg-white px-3 py-2 text-xs">
                        <span className="font-semibold text-forest">{o.code}</span>
                        <span className="text-ink-3">{fmtDate(o.deliveryDate)}</span>
                        <span>{B2B_STATUS_LABEL[o.status]}</span>
                        <span className="font-semibold">{inr(o.totalPaise)}</span>
                      </div>
                    ))}
                    {!profile.orders.length && <p className="text-xs text-ink-3">No orders yet.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ============================ Register ============================ */

const EMPTY_BIZ = {
  name: "", type: "HOTEL" as BusinessType, contactPerson: "", mobile: "", altMobile: "", email: "",
  line1: "", landmark: "", area: "", city: "Vijayawada", state: "Andhra Pradesh", pincode: "",
  gst: "", pan: "", billingAddress: "", paymentTerm: "CASH" as PaymentTerm, discountPct: "0", creditLimitRupees: "0",
  preferredTime: "", deliveryNotes: "", lat: "", lng: "",
};

function RegisterTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [f, setF] = useState({ ...EMPTY_BIZ });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<BusinessRow | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    try {
      const payload = {
        name: f.name, type: f.type, contactPerson: f.contactPerson, mobile: f.mobile, altMobile: f.altMobile, email: f.email,
        line1: f.line1, landmark: f.landmark, area: f.area, city: f.city, state: f.state, pincode: f.pincode,
        gst: f.gst, pan: f.pan, billingAddress: f.billingAddress, paymentTerm: f.paymentTerm,
        discountBps: Math.round((Number(f.discountPct) || 0) * 100),
        creditLimitPaise: Math.round((Number(f.creditLimitRupees) || 0) * 100),
        preferredTime: f.preferredTime, deliveryNotes: f.deliveryNotes,
        lat: f.lat ? Number(f.lat) : undefined, lng: f.lng ? Number(f.lng) : undefined,
      };
      const j = await api("/api/b2b/businesses", { method: "POST", body: JSON.stringify(payload) });
      setCreated(j.business); flash(`Registered ${j.business.code}`); setF({ ...EMPTY_BIZ });
    } catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {created && (
        <div className="flex items-center justify-between rounded-2xl border border-leaf bg-mint-soft px-4 py-3">
          <div><p className="text-xs text-ink-3">New Business ID</p><p className="font-display text-xl font-bold text-forest">{created.code}</p></div>
          <button onClick={onDone} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">View businesses →</button>
        </div>
      )}

      <Section title="Business information">
        <Field label="Business name *"><input value={f.name} onChange={set("name")} className={inp} /></Field>
        <Field label="Business type *">
          <select value={f.type} onChange={set("type")} className={inp}>{BUSINESS_TYPES.map((t) => <option key={t} value={t}>{BUSINESS_TYPE_LABEL[t]}</option>)}</select>
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact person *"><input value={f.contactPerson} onChange={set("contactPerson")} className={inp} /></Field>
        <Field label="Mobile *"><input value={f.mobile} onChange={set("mobile")} inputMode="tel" className={inp} /></Field>
        <Field label="Alternate number"><input value={f.altMobile} onChange={set("altMobile")} inputMode="tel" className={inp} /></Field>
        <Field label="Email"><input value={f.email} onChange={set("email")} type="email" className={inp} /></Field>
      </Section>

      <Section title="Address">
        <Field label="Business address *" wide><input value={f.line1} onChange={set("line1")} className={inp} /></Field>
        <Field label="Landmark"><input value={f.landmark} onChange={set("landmark")} className={inp} /></Field>
        <Field label="Area"><input value={f.area} onChange={set("area")} className={inp} /></Field>
        <Field label="City"><input value={f.city} onChange={set("city")} className={inp} /></Field>
        <Field label="State"><input value={f.state} onChange={set("state")} className={inp} /></Field>
        <Field label="Pincode *"><input value={f.pincode} onChange={set("pincode")} inputMode="numeric" className={inp} /></Field>
        <Field label="Latitude"><input value={f.lat} onChange={set("lat")} inputMode="decimal" className={inp} placeholder="From Google Maps" /></Field>
        <Field label="Longitude"><input value={f.lng} onChange={set("lng")} inputMode="decimal" className={inp} placeholder="From Google Maps" /></Field>
      </Section>

      <Section title="GST & billing (optional)">
        <Field label="GST number"><input value={f.gst} onChange={set("gst")} className={inp} /></Field>
        <Field label="PAN"><input value={f.pan} onChange={set("pan")} className={inp} /></Field>
        <Field label="Billing address" wide><input value={f.billingAddress} onChange={set("billingAddress")} className={inp} /></Field>
      </Section>

      <Section title="Payment & delivery">
        <Field label="Payment terms">
          <select value={f.paymentTerm} onChange={set("paymentTerm")} className={inp}>{PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</option>)}</select>
        </Field>
        <Field label="Discount %"><input value={f.discountPct} onChange={set("discountPct")} inputMode="decimal" className={inp} /></Field>
        <Field label="Credit limit (₹)"><input value={f.creditLimitRupees} onChange={set("creditLimitRupees")} inputMode="numeric" className={inp} /></Field>
        <Field label="Preferred delivery time"><input value={f.preferredTime} onChange={set("preferredTime")} className={inp} placeholder="e.g. 5:30 AM" /></Field>
        <Field label="Delivery notes" wide><textarea value={f.deliveryNotes} onChange={set("deliveryNotes")} rows={2} className={inp} /></Field>
      </Section>

      <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Register business"}</button>
    </div>
  );
}

/* ============================ Create order ============================ */

interface LineItem { productSlug: string; productName: string; quantity: string; unit: string; unitPriceRupees: string; }

function CreateOrderTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<BusinessRow[]>([]);
  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [deliveryTime, setDeliveryTime] = useState("7:00 AM");
  const [taxPct, setTaxPct] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const search = useCallback(async () => {
    try { const j = await api(`/api/b2b/businesses?q=${encodeURIComponent(q.trim())}`); setMatches(j.businesses); }
    catch (e) { flash((e as Error).message); }
  }, [q, flash]);

  function addItem() {
    const p = B2B_PRODUCTS[0];
    setItems((s) => [...s, { productSlug: p.slug, productName: p.name, quantity: "1", unit: p.primaryUnit, unitPriceRupees: (p.defaultPricePaise / 100).toString() }]);
  }
  function updItem(i: number, patch: Partial<LineItem>) {
    setItems((s) => s.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      if (patch.productSlug) {
        const p = B2B_PRODUCTS.find((x) => x.slug === patch.productSlug)!;
        next.productName = p.name; next.unit = p.primaryUnit; next.unitPriceRupees = (p.defaultPricePaise / 100).toString();
      }
      return next;
    }));
  }
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const discountBps = biz?.discountBps ?? 0;
  const subtotal = items.reduce((s, it) => s + Math.round((Number(it.unitPriceRupees) || 0) * 100 * (Number(it.quantity) || 0)), 0);
  const discount = Math.round((subtotal * discountBps) / 10000);
  const tax = Math.round(((subtotal - discount) * (Number(taxPct) || 0) * 100) / 10000);
  const total = subtotal - discount + tax;

  async function submit() {
    if (!biz) { flash("Select a business first"); return; }
    if (!items.length) { flash("Add at least one product"); return; }
    setBusy(true);
    try {
      const payload = {
        businessId: biz.id, deliveryDate, deliveryTime, deliveryNotes,
        items: items.map((it) => ({ productSlug: it.productSlug, productName: it.productName, quantity: Number(it.quantity) || 0, unit: it.unit, unitPricePaise: Math.round((Number(it.unitPriceRupees) || 0) * 100) })),
        taxBps: Math.round((Number(taxPct) || 0) * 100), remarks,
      };
      const j = await api("/api/b2b/orders", { method: "POST", body: JSON.stringify(payload) });
      flash(`Order ${j.order.code} created`); onDone();
    } catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* business picker */}
      {!biz ? (
        <Section title="Select business">
          <div className="col-span-2 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Business ID / name / mobile / GST" className={inp} />
            <button onClick={search} className="shrink-0 rounded-full border border-mint-soft px-4 text-sm font-semibold text-forest hover:border-leaf">Find</button>
          </div>
          {matches.length > 0 && (
            <div className="col-span-2 divide-y divide-mint-soft rounded-xl border border-mint-soft">
              {matches.map((m) => (
                <button key={m.id} onClick={() => { setBiz(m); setMatches([]); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-mint-soft/40">
                  <span><span className="font-semibold text-forest">{m.code}</span> · {m.name}</span>
                  <span className="text-ink-3">{m.mobile}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <div className="rounded-2xl border border-leaf bg-mint-soft px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-bold text-forest">{biz.code} · {biz.name}</p>
              <p className="text-ink-2">{biz.contactPerson} · {biz.mobile} · {PAYMENT_TERM_LABEL[biz.paymentTerm]} · Discount {(biz.discountBps / 100).toFixed(2)}%</p>
              <p className="text-ink-3">{biz.line1}, {biz.city} {biz.pincode}{biz.preferredTime ? ` · Prefers ${biz.preferredTime}` : ""}</p>
            </div>
            <button onClick={() => setBiz(null)} className="text-xs font-semibold text-leaf-600 underline">Change</button>
          </div>
        </div>
      )}

      {/* items */}
      <Section title="Products">
        <div className="col-span-2 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-mint-soft bg-white p-3">
              <label className="text-xs text-ink-3">Product
                <select value={it.productSlug} onChange={(e) => updItem(i, { productSlug: e.target.value })} className={`${inp} mt-1`}>
                  {B2B_PRODUCTS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-3">Qty
                <input value={it.quantity} onChange={(e) => updItem(i, { quantity: e.target.value })} inputMode="decimal" className={`${inp} mt-1 w-20`} />
              </label>
              <label className="text-xs text-ink-3">Unit
                <select value={it.unit} onChange={(e) => updItem(i, { unit: e.target.value })} className={`${inp} mt-1 w-24`}>
                  {(B2B_PRODUCTS.find((p) => p.slug === it.productSlug)?.units ?? []).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-3">Unit price (₹)
                <input value={it.unitPriceRupees} onChange={(e) => updItem(i, { unitPriceRupees: e.target.value })} inputMode="decimal" className={`${inp} mt-1 w-28`} />
              </label>
              <span className="ml-auto text-sm font-semibold text-forest">{inr(Math.round((Number(it.unitPriceRupees) || 0) * 100 * (Number(it.quantity) || 0)))}</span>
              <button onClick={() => removeItem(i)} className="text-xs font-semibold text-red-600 underline">Remove</button>
            </div>
          ))}
          <button onClick={addItem} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">+ Add product</button>
        </div>
      </Section>

      {/* delivery + totals */}
      <Section title="Delivery & review">
        <Field label="Delivery date *"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inp} /></Field>
        <Field label="Preferred delivery time *"><input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className={inp} placeholder="e.g. 5:30 AM / Custom" /></Field>
        <Field label="Tax %"><input value={taxPct} onChange={(e) => setTaxPct(e.target.value)} inputMode="decimal" className={inp} /></Field>
        <Field label="Delivery notes"><input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className={inp} /></Field>
        <Field label="Remarks" wide><input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inp} /></Field>
      </Section>

      <div className="ml-auto max-w-xs space-y-1 rounded-2xl border border-mint-soft bg-white p-4 text-sm">
        <Row k="Subtotal" v={inr(subtotal)} />
        <Row k={`Discount (${(discountBps / 100).toFixed(2)}%)`} v={`– ${inr(discount)}`} />
        <Row k={`Tax (${Number(taxPct) || 0}%)`} v={inr(tax)} />
        <div className="mt-1 border-t border-mint-soft pt-1"><Row k="Total" v={inr(total)} bold /></div>
      </div>

      <button disabled={busy || !biz || !items.length} onClick={submit} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit order"}</button>
    </div>
  );
}

/* ============================ Orders ============================ */

const ORDER_FILTERS: (B2BOrderStatus | "all")[] = ["all", "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED"];

function OrdersTab({ flash }: { flash: (m: string) => void }) {
  const [filter, setFilter] = useState<B2BOrderStatus | "all">("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filter !== "all") qs.set("status", filter);
      if (q.trim()) qs.set("q", q.trim());
      const j = await api(`/api/b2b/orders?${qs}`); setRows(j.orders); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [filter, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ORDER_FILTERS.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === s ? "bg-leaf text-white" : "border border-mint-soft text-forest hover:border-leaf"}`}>
            {s === "all" ? "All" : B2B_STATUS_LABEL[s]}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order / business…" className="ml-auto min-w-[200px] rounded-lg border border-mint-soft px-3 py-2 text-sm" />
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Order", "Business", "Delivery", "Items", "Total", "Paid", "Payment", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((o) => <OrderRowView key={o.id} o={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} flash={flash} onChanged={load} />)}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-3">No orders {filter !== "all" ? "in this status" : "yet"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderStatusBadge({ s }: { s: B2BOrderStatus }) {
  const tone = s === "CANCELLED" ? "bg-red-100 text-red-700" : s === "COMPLETED" || s === "DELIVERED" ? "bg-leaf text-white" : s === "PENDING" ? "bg-mint-soft text-leaf-600" : "bg-gold-soft text-gold";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{B2B_STATUS_LABEL[s]}</span>;
}

function OrderRowView({ o, open, onToggle, flash, onChanged }: { o: OrderRow; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void; }) {
  const [busy, setBusy] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const next = allowedNextStatus(o.status);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try { await api(`/api/b2b/orders/${o.id}`, { method: "PATCH", body: JSON.stringify(body) }); flash(ok); onChanged(); }
    catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <tr className="border-b border-mint-soft/60 hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-semibold text-forest">{o.code}</td>
        <td className="px-4 py-3 text-ink-2">{o.business.name}</td>
        <td className="px-4 py-3 text-ink-2">{fmtDate(o.deliveryDate)} · {o.deliveryTime}</td>
        <td className="px-4 py-3 text-ink-2">{o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join(", ")}</td>
        <td className="px-4 py-3 font-semibold">{inr(o.totalPaise)}</td>
        <td className="px-4 py-3 text-ink-2">{inr(o.paidPaise)}</td>
        <td className="px-4 py-3 text-ink-2">{o.paymentStatus}</td>
        <td className="px-4 py-3"><OrderStatusBadge s={o.status} /></td>
        <td className="px-4 py-3 text-right"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]"><td colSpan={9} className="px-4 py-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Change status</p>
              <div className="flex flex-wrap gap-2">
                {next.length ? next.map((s) => (
                  <button key={s} disabled={busy} onClick={() => patch({ action: s === "CANCELLED" ? "cancel" : "status", status: s }, `Moved to ${B2B_STATUS_LABEL[s]}`)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${s === "CANCELLED" ? "border border-red-200 text-red-600" : "bg-leaf text-white"}`}>{B2B_STATUS_LABEL[s]} →</button>
                )) : <span className="text-xs text-ink-3">Terminal status.</span>}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Record payment</p>
              <div className="flex flex-wrap items-center gap-2">
                <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount ₹" inputMode="decimal" className="w-28 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-mint-soft px-2 py-1.5 text-sm">{["Cash", "UPI", "Bank Transfer", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}</select>
                <button disabled={busy || !payAmt} onClick={() => { patch({ action: "pay", amountPaise: Math.round((Number(payAmt) || 0) * 100), method: payMethod }, "Payment recorded"); setPayAmt(""); }} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Add</button>
              </div>
              <p className="mt-1 text-xs text-ink-3">Outstanding: {inr(o.totalPaise - o.paidPaise)}</p>
            </div>

            <div className="space-y-2">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Actions</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => patch({ action: "invoice" }, "Invoice generated")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Generate invoice</button>
                <button disabled={busy} onClick={() => patch({ action: "reorder" }, "Order duplicated")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Reorder / Duplicate</button>
                <button disabled={busy} onClick={() => window.print()} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Print</button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ============================ Reports ============================ */

function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<B2BReportsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      setData(await api(`/api/b2b/reports?${qs}`));
    } catch (e) { flash((e as Error).message); }
  }, [from, to, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!data) return;
    const lines = [
      ["B2B Sales Report"], [`Range`, from || "all", to || "all"], [],
      ["Total orders", data.totalOrders], ["Revenue (₹)", (data.totalRevenuePaise / 100).toFixed(2)],
      ["Collected (₹)", (data.collectedPaise / 100).toFixed(2)], ["Outstanding (₹)", (data.outstandingPaise / 100).toFixed(2)], [],
      ["Top businesses"], ["Business ID", "Name", "Orders", "Revenue (₹)"],
      ...data.topBusinesses.map((b) => [b.code ?? "", b.name ?? "", b.orders, (b.revenuePaise / 100).toFixed(2)]), [],
      ["Top products"], ["Product", "Qty", "Revenue (₹)"],
      ...data.topProducts.map((p) => [p.name, p.qty, (p.revenuePaise / 100).toFixed(2)]),
    ];
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `b2b-report-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-3">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1`} /></label>
        <label className="text-xs text-ink-3">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inp} mt-1`} /></label>
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">Apply</button>
        <button onClick={exportCsv} disabled={!data} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Total orders" value={data.totalOrders.toLocaleString("en-IN")} big />
            <Kpi label="Revenue" value={inr(data.totalRevenuePaise)} big />
            <Kpi label="Collected" value={inr(data.collectedPaise)} big />
            <Kpi label="Outstanding" value={inr(data.outstandingPaise)} big />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ReportTable title="Top businesses" head={["Business", "Orders", "Revenue"]} rows={data.topBusinesses.map((b) => [`${b.code ?? ""} ${b.name ?? ""}`.trim(), String(b.orders), inr(b.revenuePaise)])} />
            <ReportTable title="Top products" head={["Product", "Qty", "Revenue"]} rows={data.topProducts.map((p) => [p.name, String(p.qty), inr(p.revenuePaise)])} />
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Orders by status</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.statusCounts).map(([s, n]) => (
                <span key={s} className="rounded-full border border-mint-soft bg-white px-3 py-1.5 text-xs"><b className="text-forest">{n}</b> {B2B_STATUS_LABEL[s as B2BOrderStatus] ?? s}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-mint-soft bg-white">
      <p className="border-b border-mint-soft bg-[#F6FAF6] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-ink-3"><tr>{head.map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-t border-mint-soft/60">{r.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? "text-ink-2" : "text-forest"}`}>{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">No data</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ============================ shared bits ============================ */

const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-base font-bold text-forest">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`text-xs font-semibold text-ink-3 ${wide ? "sm:col-span-2" : ""}`}><span className="mb-1 block">{label}</span>{children}</label>;
}
function Detail({ k, v }: { k: string; v: string }) {
  return <p><span className="font-semibold text-forest">{k}:</span> {v}</p>;
}
function Kpi({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-mint-soft bg-white px-3 py-2">
      <p className={`font-display font-bold text-forest ${big ? "text-xl" : "text-sm"}`}>{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-forest" : "text-ink-2"}`}><span>{k}</span><span>{v}</span></div>;
}
