"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingListItem, BillingListResponse, BillingStats, BillingDetail, BillingPreview, BillingReports } from "@/lib/billing/types";

/* ---------- shared helpers (match the admin module conventions) ---------- */
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const inr2 = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm outline-none focus:border-leaf";
const sel = "rounded-lg border border-mint-soft bg-white px-3 py-2 text-sm outline-none focus:border-leaf";
const METHODS = ["UPI", "CARD", "NETBANKING", "WALLET", "CASH"];
const MANDATES = ["UPI AutoPay", "Credit Card", "Net Banking"];

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

const PAY_TONE: Record<string, string> = { PAID: "bg-leaf text-white", PARTIAL: "bg-amber-50 text-amber-700", PENDING: "bg-blue-50 text-blue-700", FAILED: "bg-red-50 text-red-700", REFUNDED: "bg-gray-100 text-gray-500" };
const BILL_TONE: Record<string, string> = { ISSUED: "bg-blue-50 text-blue-700", RENEWED: "bg-leaf/10 text-leaf-600", DRAFT: "bg-gray-100 text-gray-500", CANCELLED: "bg-gray-100 text-gray-400 line-through" };
const Pill = ({ s, map }: { s: string; map: Record<string, string> }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${map[s] ?? "bg-gray-100 text-gray-600"}`}>{s[0] + s.slice(1).toLowerCase()}</span>;
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-mint-soft bg-white p-5">
    <div className="font-display text-2xl font-bold text-leaf-600">{value}</div>
    <div className="mt-1 text-sm text-ink-3">{label}</div>
    {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
  </div>
);
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-mint-soft bg-white p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h4>{children}</div>;
}

type Tab = "dashboard" | "billing" | "create" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" }, { key: "billing", label: "Billing Records" },
  { key: "create", label: "Create Billing" }, { key: "reports", label: "Reports" },
];

export function BillingBoard() {
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
      {tab === "billing" && <BillingTab flash={flash} />}
      {tab === "create" && <CreateTab flash={flash} onDone={() => setTab("billing")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================= Dashboard ============================= */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<BillingStats | null>(null);
  useEffect(() => { api("/api/admin/billing/stats").then(setS).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!s) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Active billing cycles" value={String(s.activeBillingCycles)} />
      <Kpi label="Upcoming renewals (7d)" value={String(s.upcomingRenewals)} />
      <Kpi label="Today's renewals" value={String(s.todaysRenewals)} />
      <Kpi label="Auto-pay renewals" value={String(s.autoPayRenewals)} />
      <Kpi label="Successful payments" value={String(s.successfulPayments)} />
      <Kpi label="Failed payments" value={String(s.failedPayments)} />
      <Kpi label="Pending collections" value={inr(s.pendingCollectionsPaise)} />
      <Kpi label="Total billing revenue" value={inr(s.totalBillingRevenuePaise)} sub="collected to date" />
      <Kpi label="Monthly recurring revenue" value={inr(s.mrrPaise)} sub="active × 30 deliveries" />
      <Kpi label="Invoices issued" value={String(s.invoicesIssued)} />
    </div>
  );
}

/* ============================= Billing list ============================= */
function BillingTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [billStatus, setBillStatus] = useState("");
  const [autopay, setAutopay] = useState("");
  const [plan, setPlan] = useState("");
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BillingListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (payStatus) p.set("paymentStatus", payStatus);
    if (billStatus) p.set("billingStatus", billStatus);
    if (autopay) p.set("autopay", autopay);
    if (plan) p.set("plan", plan);
    if (product) p.set("product", product);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("sort", sort); p.set("page", String(page)); p.set("pageSize", "15");
    return `/api/admin/billing?${p.toString()}`;
  }, [q, payStatus, billStatus, autopay, plan, product, from, to, sort, page]);

  const reload = useCallback(() => { setError(null); api(url).then(setData).catch((e) => setError((e as Error).message)); }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, payStatus, billStatus, autopay, plan, product, from, to, sort]);

  const rows = data?.billings ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Billing ID, Subscription, Invoice, name, mobile…" className={`${sel} min-w-[240px] flex-1`} />
        <select value={payStatus} onChange={(e) => setPayStatus(e.target.value)} className={sel}>
          <option value="">Payment: any</option>{["PENDING", "PARTIAL", "PAID", "FAILED", "REFUNDED"].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={billStatus} onChange={(e) => setBillStatus(e.target.value)} className={sel}>
          <option value="">Billing: any</option>{["DRAFT", "ISSUED", "RENEWED", "CANCELLED"].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={autopay} onChange={(e) => setAutopay(e.target.value)} className={sel}><option value="">Auto-pay: any</option><option value="on">On</option><option value="off">Off</option></select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={sel}><option value="">All plans</option>{facets?.plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={sel}><option value="">All products</option>{facets?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
        <label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}>
          <option value="latest">Latest billing</option><option value="oldest">Oldest billing</option>
          <option value="amount_high">Highest amount</option><option value="amount_low">Lowest amount</option><option value="renewal">Renewal date</option>
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Billing", "Customer", "Plan / cycle", "Billing date", "Renewal", "Total", "Wallet", "Auto-pay", "Payment", "Status", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-ink-3">No billing records match these filters.</td></tr>}
            {rows.map((b) => (
              <Row key={b.id} b={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} flash={flash} onChanged={reload} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{total} record{total === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
          <button disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}

function Row({ b, open, onToggle, flash, onChanged }: { b: BillingListItem; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-b border-mint-soft/60 align-top">
        <td className="px-3 py-3"><div className="font-mono text-xs font-bold text-forest">{b.code}</div><div className="text-xs text-ink-3">{b.subscriptionShortId} · {b.invoiceNumber ?? "no inv"}</div></td>
        <td className="px-3 py-3"><div className="font-semibold text-forest">{b.customer.name ?? "—"}</div><div className="text-xs text-ink-3">{b.customer.phone ?? ""}</div></td>
        <td className="px-3 py-3"><div className="text-ink-2">{b.planName}</div><div className="text-xs text-ink-3">cycle {b.cycleNumber} · {b.product} {b.variant}</div></td>
        <td className="px-3 py-3 text-xs text-ink-2">{fmtDate(b.billingDate)}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{fmtDate(b.renewalDate)}</td>
        <td className="px-3 py-3 font-semibold text-forest">{inr(b.totalPaise)}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{b.walletUsedPaise ? inr(b.walletUsedPaise) : "—"}</td>
        <td className="px-3 py-3">{b.autoPay ? <span className="rounded-full bg-leaf/10 px-2 py-0.5 text-xs font-bold text-leaf-600">On</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-500">Off</span>}</td>
        <td className="px-3 py-3"><Pill s={b.paymentStatus} map={PAY_TONE} /></td>
        <td className="px-3 py-3"><Pill s={b.billingStatus} map={BILL_TONE} /></td>
        <td className="px-3 py-3"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:bg-[#F6FAF6]">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && <tr><td colSpan={11} className="bg-[#FAFCF9] px-3 py-4"><ManagePanel id={b.id} flash={flash} onChanged={onChanged} /></td></tr>}
    </>
  );
}

/* ============================= Manage panel ============================= */
function ManagePanel({ id, flash, onChanged }: { id: string; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<BillingDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api(`/api/admin/billing/${id}`).then((r) => setD(r.billing)).catch((e) => flash((e as Error).message)); }, [id, flash]);
  useEffect(() => { load(); }, [load]);

  async function mutate(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try { await api(`/api/admin/billing/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); onChanged(); }
    catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!d) return <p className="text-sm text-ink-3">Loading billing record…</p>;
  const closed = d.billingStatus === "CANCELLED";
  const paid = d.paymentStatus === "PAID";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* left: breakdown + items + customer */}
      <div className="space-y-3">
        <Card title="Customer">
          <p className="font-semibold text-forest">{d.customer.name ?? "—"}</p>
          <p className="text-xs text-ink-3">{d.customer.email ?? ""} · {d.customer.phone ?? ""}</p>
          <p className="mt-1 text-xs">Wallet balance: <b className="text-forest">{inr(d.customer.walletPaise)}</b></p>
          <p className="text-xs text-ink-3">Subscription {d.subscriptionShortId} · {d.planName} · cycle {d.cycleNumber}</p>
        </Card>
        <Card title="Billing breakdown">
          <table className="w-full text-xs">
            <tbody>
              {d.items.map((i, n) => <tr key={n}><td className="py-0.5 text-ink-2">{i.qty}× {i.productName} {i.variantLabel}</td><td className="py-0.5 text-right text-ink-3">{inr(i.lineTotalPaise)}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 border-t border-mint-soft pt-2 text-xs">
            <Line k="Billing amount" v={inr2(d.billingAmountPaise)} />
            {d.discountPaise > 0 && <Line k="Discount" v={`− ${inr2(d.discountPaise)}`} tone="text-leaf-600" />}
            <Line k={`GST (${(d.gstBps / 100).toFixed(d.gstBps % 100 ? 2 : 0)}%)`} v={inr2(d.gstPaise)} />
            {d.walletUsedPaise > 0 && <Line k="Wallet applied" v={`− ${inr2(d.walletUsedPaise)}`} tone="text-leaf-600" />}
            <div className="flex justify-between border-t border-mint-soft pt-1 text-sm"><span className="font-semibold text-forest">Total payable</span><b className="text-forest">{inr2(d.totalPaise)}</b></div>
            <Line k="Paid" v={inr2(d.amountPaidPaise)} />
            {d.duePaise > 0 && <Line k="Due" v={inr2(d.duePaise)} tone="text-red-600" />}
          </div>
        </Card>
        <Card title="Auto-pay & cashback">
          <p className="text-xs">Auto-pay: <b className={d.autoPay ? "text-leaf-600" : "text-ink-3"}>{d.autoPay ? "On" : "Off"}</b>{d.autopay ? ` · mandate ${d.autopay.status.toLowerCase()} · ${d.autopay.attempts} attempts` : " · no mandate"}</p>
          <p className="mt-1 text-xs">Trial cashback: {d.trialCashback ? <b className="text-leaf-600">{d.trialCashback.status} · {inr(d.trialCashback.amountPaise)}</b> : <span className="text-ink-3">not credited</span>}</p>
        </Card>
        <Card title="Wallet activity">
          {d.walletTxns.length === 0 ? <p className="text-xs text-ink-3">No recent transactions.</p> : (
            <table className="w-full text-xs"><tbody>{d.walletTxns.map((w) => <tr key={w.id}><td className="py-0.5 text-ink-2">{w.description ?? w.kind}</td><td className={`py-0.5 text-right font-semibold ${w.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{w.type === "CREDIT" ? "+" : "−"}{inr(w.amountPaise)}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>

      {/* middle: actions + payment attempts + renewals */}
      <div className="space-y-3">
        <Card title="Actions">
          <div className="mb-2 flex items-center gap-2 text-xs"><Pill s={d.paymentStatus} map={PAY_TONE} /><Pill s={d.billingStatus} map={BILL_TONE} /></div>
          {!closed && (
            <div className="space-y-2">
              {!paid && <PayBox busy={busy} due={d.duePaise} onPay={(method, amountPaise) => mutate({ action: "pay", method, amountPaise }, "Payment recorded")} />}
              {!paid && <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => mutate({ action: "autopay" }, "Auto-pay run")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Run auto-pay</button>
                <button disabled={busy} onClick={() => mutate({ action: "retry" }, "Retry attempted")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Retry payment</button>
                <MethodBox busy={busy} onChange={(type, label) => mutate({ action: "method", type, label }, "Payment method updated")} />
              </div>}
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => mutate({ action: "renew" }, "Subscription renewed")} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Renew → next cycle</button>
                <button disabled={busy} onClick={() => openInvoicePrint(d)} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Print / Download invoice</button>
                {!d.invoiceNumber && <button disabled={busy} onClick={() => mutate({ action: "invoice" }, "Invoice generated")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Generate invoice</button>}
                <CancelBox busy={busy} onCancel={(reason, refund) => mutate({ action: "cancel", reason, refund }, "Billing cancelled")} />
              </div>
            </div>
          )}
          {closed && <p className="text-xs text-ink-3">This billing record is cancelled.{d.notes ? ` ${d.notes}` : ""}</p>}
        </Card>
        <Card title="Payment attempts">
          {d.attempts.length === 0 ? <p className="text-xs text-ink-3">No attempts yet.</p> : (
            <table className="w-full text-xs">
              <thead className="text-ink-3"><tr><th className="text-left font-semibold">#</th><th className="text-left font-semibold">Method</th><th className="text-left font-semibold">Status</th><th className="text-right font-semibold">Amount</th></tr></thead>
              <tbody>{d.attempts.map((a) => <tr key={a.id}><td className="py-0.5">{a.attemptNo}</td><td className="py-0.5">{a.method}</td><td className={`py-0.5 font-semibold ${a.status === "SUCCESS" ? "text-leaf-600" : a.status === "FAILED" ? "text-red-600" : "text-ink-3"}`}>{a.status[0] + a.status.slice(1).toLowerCase()}{a.failureReason ? ` · ${a.failureReason}` : ""}</td><td className="py-0.5 text-right">{inr(a.amountPaise)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Renewal / cycle history">
          {d.renewals.map((r) => <div key={r.code} className="flex items-center justify-between text-xs"><span className="font-mono text-ink-2">{r.code} · cycle {r.cycleNumber}</span><span className="text-ink-3">{inr(r.totalPaise)} · {r.paymentStatus.toLowerCase()}</span></div>)}
        </Card>
      </div>

      {/* right: timeline + notes */}
      <div className="space-y-3">
        <Card title="Audit timeline">
          <ol className="space-y-2">
            {d.events.length === 0 && <li className="text-xs text-ink-3">No events yet.</li>}
            {d.events.map((e) => (
              <li key={e.id} className="border-l-2 border-mint-soft pl-3 text-xs">
                <div className="font-semibold text-forest">{e.summary}</div>
                <div className="text-ink-3">{fmtDT(e.createdAt)}{e.byRole ? ` · ${e.byRole}` : ""}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Internal notes">
          {d.notes && <pre className="mb-2 whitespace-pre-wrap text-xs text-ink-2">{d.notes}</pre>}
          <NoteBox busy={busy} onAdd={(text) => mutate({ action: "note", text }, "Note added")} />
        </Card>
      </div>
    </div>
  );
}

const Line = ({ k, v, tone }: { k: string; v: string; tone?: string }) => <div className="flex justify-between"><span className="text-ink-3">{k}</span><span className={tone ?? "text-ink-2"}>{v}</span></div>;

function PayBox({ busy, due, onPay }: { busy: boolean; due: number; onPay: (method: string, amountPaise: number) => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("UPI");
  const [amt, setAmt] = useState(String(Math.round(due / 100)));
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full bg-forest px-3 py-1.5 text-xs font-semibold text-white">Record payment</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#F6FAF6] p-2">
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border border-mint-soft px-2 py-1 text-xs">{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      <label className="text-[11px] text-ink-3">₹ <input type="number" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} className="w-24 rounded border border-mint-soft px-2 py-1 text-xs" /></label>
      <button disabled={busy} onClick={() => { onPay(method, Math.max(1, Math.round(Number(amt || 0) * 100))); setOpen(false); }} className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm</button>
    </div>
  );
}
function MethodBox({ busy, onChange }: { busy: boolean; onChange: (type: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(MANDATES[0]);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Change method</button>;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#F6FAF6] p-2">
      <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-mint-soft px-2 py-1 text-xs">{MANDATES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      <button disabled={busy} onClick={() => { onChange(type, type); setOpen(false); }} className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save mandate</button>
    </div>
  );
}
function CancelBox({ busy, onCancel }: { busy: boolean; onCancel: (reason: string, refund: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="rounded border border-mint-soft px-2 py-1 text-xs" />
      <label className="flex items-center gap-1 text-[11px] text-ink-3"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund to wallet</label>
      <button disabled={busy} onClick={() => { onCancel(reason, refund); setOpen(false); }} className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm</button>
    </div>
  );
}
function NoteBox({ busy, onAdd }: { busy: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded border border-mint-soft px-2 py-1 text-xs" />
      <button disabled={busy || !text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest disabled:opacity-40">Add</button>
    </div>
  );
}

/* ============================= Create ============================= */
function CreateTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [subs, setSubs] = useState<{ id: string; shortId: string; plan: string; customer: string | null; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; shortId: string } | null>(null);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [walletApply, setWalletApply] = useState("0");
  const [autoCollect, setAutoCollect] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRecent = useCallback(() => { api("/api/admin/billing/options").then((r) => setSubs(r.subscriptions)).catch((e) => flash((e as Error).message)); }, [flash]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  function search() { api(`/api/admin/billing/options?q=${encodeURIComponent(q.trim())}`).then((r) => setSubs(r.subscriptions)).catch((e) => flash((e as Error).message)); }
  function pick(s: { id: string; shortId: string }) {
    setPicked(s); setWalletApply("0");
    api(`/api/admin/billing/options?subscriptionId=${s.id}`).then((r) => setPreview(r.preview)).catch((e) => flash((e as Error).message));
  }

  const walletPaise = Math.max(0, Math.min(Math.round(Number(walletApply || 0) * 100), preview?.maxWalletPaise ?? 0));
  const taxable = preview ? preview.billingAmountPaise - preview.discountPaise : 0;
  const grossPayable = taxable + (preview?.gstPaise ?? 0);
  const total = Math.max(0, grossPayable - walletPaise);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await api("/api/admin/billing", { method: "POST", body: JSON.stringify({ subscriptionId: picked.id, walletApplyPaise: walletPaise, autoCollect }) });
      flash(`Billing ${r.billing?.code ?? ""} created`); onDone();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="1 · Subscription">
        {picked ? (
          <p className="flex items-center justify-between text-sm"><span className="font-semibold text-forest">{preview?.customer.name ?? picked.shortId} · {preview?.planName}</span><button onClick={() => { setPicked(null); setPreview(null); loadRecent(); }} className="text-xs text-leaf-600 underline">change</button></p>
        ) : (
          <>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search subscription ID / customer / mobile" className={inp} />
              <button onClick={search} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">Search</button>
            </div>
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {subs.map((s) => <button key={s.id} onClick={() => pick(s)} className="flex w-full items-center justify-between rounded-lg border border-mint-soft px-3 py-2 text-left text-sm hover:bg-[#F6FAF6]"><span>{s.customer ?? "—"} · <span className="font-mono text-xs">{s.shortId}</span></span><span className="text-xs text-ink-3">{s.plan} · {s.phone}</span></button>)}
            </div>
          </>
        )}
      </Card>

      {picked && preview && (
        <>
          <Card title="2 · Billing breakdown (auto-calculated)">
            {preview.alreadyBilled && <p className="mb-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-700">Note: a billing record already exists for this cycle. Saving will be blocked as a duplicate.</p>}
            <div className="space-y-0.5 text-xs">
              <Line k={`Cycle ${preview.cycleNumber} · ${fmtDate(preview.periodStart)} → ${fmtDate(preview.periodEnd)}`} v="" />
              {preview.items.map((i, n) => <Line key={n} k={`${i.qty}× ${i.productName} ${i.variantLabel}`} v={inr2(i.lineTotalPaise)} />)}
              <div className="border-t border-mint-soft pt-1"><Line k="Billing amount" v={inr2(preview.billingAmountPaise)} /></div>
              {preview.discountPaise > 0 && <Line k="Discount" v={`− ${inr2(preview.discountPaise)}`} tone="text-leaf-600" />}
              <Line k={`GST (${(preview.gstBps / 100).toFixed(preview.gstBps % 100 ? 2 : 0)}%)`} v={inr2(preview.gstPaise)} />
              <Line k="Wallet applied" v={`− ${inr2(walletPaise)}`} tone="text-leaf-600" />
              <div className="flex justify-between border-t border-mint-soft pt-1 text-sm"><span className="font-semibold text-forest">Total payable</span><b className="text-forest">{inr2(total)}</b></div>
            </div>
          </Card>
          <Card title="3 · Payment">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">Apply wallet (max {inr(preview.maxWalletPaise)})<input type="number" min={0} value={walletApply} onChange={(e) => setWalletApply(e.target.value)} className={inp} /></label>
              <label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={autoCollect} onChange={(e) => setAutoCollect(e.target.checked)} /> Attempt auto-pay collection now</label>
            </div>
          </Card>
          <div className="flex items-center justify-between rounded-2xl border border-mint-soft bg-white p-4">
            <div className="text-sm text-ink-3">Final payable <b className="text-forest">{inr2(total)}</b></div>
            <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create billing + invoice"}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================= Reports ============================= */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [r, setR] = useState<BillingReports | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") return { from, to };
    const now = new Date(); const end = todayISO();
    const start = new Date(now);
    if (preset === "today") { /* start = today */ }
    else if (preset === "7") start.setDate(start.getDate() - 7);
    else if (preset === "30") start.setDate(start.getDate() - 30);
    else if (preset === "month") start.setDate(1);
    else if (preset === "year") { start.setMonth(0); start.setDate(1); }
    return { from: start.toISOString().slice(0, 10), to: end };
  }, [preset, from, to]);

  const load = useCallback(() => { const p = new URLSearchParams(); if (range.from) p.set("from", range.from); if (range.to) p.set("to", range.to); api(`/api/admin/billing/reports?${p.toString()}`).then(setR).catch((e) => flash((e as Error).message)); }, [range, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!r) return;
    const head = ["Billing", "Subscription", "Customer", "Mobile", "Plan", "Billing date", "Renewal", "Gross ₹", "Discount ₹", "GST ₹", "Wallet ₹", "Total ₹", "Payment", "Status", "Auto-pay", "Invoice"];
    const lines = [head, ...r.rows.map((x) => [x.code, x.subscription, x.customer, x.phone, x.plan, x.billingDate, x.renewalDate, String(x.grossRupees), String(x.discountRupees), String(x.gstRupees), String(x.walletRupees), String(x.totalRupees), x.paymentStatus, x.billingStatus, x.autoPay, x.invoice])];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `subscription-billing-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={sel}>
          <option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom</option>
        </select>
        {preset === "custom" && <>
          <label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
          <label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        </>}
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest">Refresh</button>
        <button onClick={exportCsv} disabled={!r} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>
      {!r ? <p className="text-sm text-ink-3">Loading…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Billings" value={String(r.billing.totalBillings)} />
            <Kpi label="Net billed" value={inr(r.billing.netPaise)} />
            <Kpi label="Collected" value={inr(r.billing.collectedPaise)} />
            <Kpi label="Outstanding" value={inr(r.billing.outstandingPaise)} />
            <Kpi label="GST collected" value={inr(r.gst.collectedPaise)} />
            <Kpi label="Wallet used" value={inr(r.wallet.usedPaise)} />
            <Kpi label="Failed payments" value={`${r.failed.count} · ${inr(r.failed.amountPaise)}`} />
            <Kpi label="Renewals" value={String(r.renewals.total)} sub={`${r.renewals.auto} auto · ${r.renewals.manual} manual`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="By payment status" head={["Status", "Count", "Total"]} rows={r.byStatus.map((x) => [x.status, String(x.count), inr(x.totalPaise)])} />
            <ReportTable title="GST by rate" head={["Rate", "Records", "GST"]} rows={r.gst.byRate.map((x) => [`${(x.rateBps / 100).toFixed(x.rateBps % 100 ? 2 : 0)}%`, String(x.count), inr(x.gstPaise)])} />
            <ReportTable title="Auto-pay" head={["State", "Count"]} rows={[["On", String(r.autopay.on)], ["Off", String(r.autopay.off)]]} />
            <ReportTable title="Failed payments" head={["Billing", "Customer", "Amount", "Reason"]} rows={r.failed.rows.map((x) => [x.code, x.customer, inr(x.amountPaise), x.reason])} />
          </div>
        </>
      )}
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

/* ============================= Invoice print ============================= */
function openInvoicePrint(d: BillingDetail) {
  const rows = d.items.map((i) => `<tr><td>${i.qty}× ${i.productName} ${i.variantLabel}</td><td style="text-align:right">₹${(i.lineTotalPaise / 100).toLocaleString("en-IN")}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${d.invoiceNumber ?? d.code}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a2e22;max-width:720px;margin:32px auto;padding:0 24px}
  h1{color:#2f6b3f;margin:0 0 4px;font-size:22px} .muted{color:#6b7c70;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:18px} td,th{padding:8px 6px;border-bottom:1px solid #e3efe6;font-size:14px}
  th{text-align:left;color:#6b7c70;font-size:12px;text-transform:uppercase}
  .tot td{border:none;padding:3px 6px} .tot .g{font-weight:700;font-size:16px;border-top:2px solid #2f6b3f}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f6b3f;padding-bottom:12px}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:#eaf5ec;color:#2f6b3f}
</style></head><body onload="window.print()">
  <div class="head"><div><h1>${d.company.name}</h1><div class="muted">Tax Invoice${d.company.gstin ? ` · GSTIN ${d.company.gstin}` : ""}</div></div>
  <div style="text-align:right"><div style="font-weight:700">${d.invoiceNumber ?? "(no invoice no.)"}</div><div class="muted">Billing ${d.code}</div><div class="muted">${fmtDate(d.billingDate)}</div><span class="badge">${d.paymentStatus}</span></div></div>
  <div style="margin-top:16px"><div class="muted">Billed to</div><div style="font-weight:600">${d.customer.name ?? "—"}</div><div class="muted">${d.customer.phone ?? ""} ${d.customer.email ?? ""}</div>
  <div class="muted">Subscription ${d.subscriptionShortId} · ${d.planName} · cycle ${d.cycleNumber} (${fmtDate(d.periodStart)} → ${fmtDate(d.periodEnd)})</div></div>
  <table><thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="tot" style="margin-top:4px"><tbody>
    <tr><td>Billing amount</td><td style="text-align:right">₹${(d.billingAmountPaise / 100).toLocaleString("en-IN")}</td></tr>
    ${d.discountPaise ? `<tr><td>Discount</td><td style="text-align:right">− ₹${(d.discountPaise / 100).toLocaleString("en-IN")}</td></tr>` : ""}
    <tr><td>GST (${(d.gstBps / 100).toFixed(d.gstBps % 100 ? 2 : 0)}%)</td><td style="text-align:right">₹${(d.gstPaise / 100).toLocaleString("en-IN")}</td></tr>
    ${d.walletUsedPaise ? `<tr><td>Wallet applied</td><td style="text-align:right">− ₹${(d.walletUsedPaise / 100).toLocaleString("en-IN")}</td></tr>` : ""}
    <tr class="g"><td>Total payable</td><td style="text-align:right">₹${(d.totalPaise / 100).toLocaleString("en-IN")}</td></tr>
    <tr><td>Paid</td><td style="text-align:right">₹${(d.amountPaidPaise / 100).toLocaleString("en-IN")}</td></tr>
  </tbody></table>
  <p class="muted" style="margin-top:24px">Thank you for subscribing to ${d.company.name}. This is a computer-generated invoice.</p>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (w) { w.document.write(html); w.document.close(); }
}
