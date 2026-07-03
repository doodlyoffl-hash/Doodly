"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaymentListItem, PaymentListResponse, PaymentStats, PaymentDetail, PaymentReports, GatewayRow } from "@/lib/payments/types";

/* ---------- helpers ---------- */
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const inr2 = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const ST_TONE: Record<string, string> = { SUCCESS: "bg-leaf text-white", PENDING: "bg-amber-50 text-amber-700", FAILED: "bg-red-50 text-red-700", REFUNDED: "bg-gray-100 text-gray-500", PARTIALLY_REFUNDED: "bg-blue-50 text-blue-700" };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ST_TONE[s] ?? "bg-gray-100 text-gray-600"}`}>{s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-mint-soft bg-white p-5"><div className="font-display text-2xl font-bold text-leaf-600">{value}</div><div className="mt-1 text-sm text-ink-3">{label}</div>{sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}</div>
);
function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="rounded-2xl border border-mint-soft bg-white p-4"><div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h4>{right}</div>{children}</div>;
}

type Tab = "dashboard" | "payments" | "record" | "reports" | "gateways";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" }, { key: "payments", label: "Payments" }, { key: "record", label: "Record Payment" }, { key: "reports", label: "Reports" }, { key: "gateways", label: "Gateways" },
];

export function PaymentsBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>)}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "payments" && <PaymentsTab flash={flash} />}
      {tab === "record" && <RecordTab flash={flash} onDone={() => setTab("payments")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {tab === "gateways" && <GatewaysTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================= Dashboard ============================= */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<PaymentStats | null>(null);
  useEffect(() => { api("/api/admin/payments/stats").then(setS).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!s) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total payments" value={String(s.totalPayments)} />
      <Kpi label="Today's collections" value={inr(s.todaysCollectionsPaise)} />
      <Kpi label="Monthly collections" value={inr(s.monthlyCollectionsPaise)} />
      <Kpi label="Total revenue" value={inr(s.totalRevenuePaise)} />
      <Kpi label="Successful" value={String(s.successful)} />
      <Kpi label="Pending" value={String(s.pending)} />
      <Kpi label="Failed" value={String(s.failed)} />
      <Kpi label="Refunded" value={String(s.refunded)} />
      <Kpi label="Wallet payments" value={inr(s.walletPaymentsPaise)} />
      <Kpi label="Auto-Pay collections" value={inr(s.autopayCollectionsPaise)} />
      <Kpi label="Outstanding" value={inr(s.outstandingPaise)} />
    </div>
  );
}

/* ============================= Payments list ============================= */
function PaymentsTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [gateway, setGateway] = useState("");
  const [source, setSource] = useState("");
  const [walletUsed, setWalletUsed] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaymentListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (method) p.set("method", method);
    if (gateway) p.set("gateway", gateway);
    if (source) p.set("source", source);
    if (walletUsed) p.set("walletUsed", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (amountMin) p.set("amountMin", String(Math.round(Number(amountMin) * 100)));
    if (amountMax) p.set("amountMax", String(Math.round(Number(amountMax) * 100)));
    const [s, d] = sort === "latest" ? ["created", "desc"] : sort === "oldest" ? ["created", "asc"] : sort === "high" ? ["amount", "desc"] : sort === "low" ? ["amount", "asc"] : ["customer", "asc"];
    p.set("sort", s); p.set("dir", d); p.set("page", String(page)); p.set("pageSize", "15");
    return `/api/admin/payments?${p.toString()}`;
  }, [q, status, method, gateway, source, walletUsed, from, to, amountMin, amountMax, sort, page]);

  const reload = useCallback(() => { setError(null); api(url).then(setData).catch((e) => setError((e as Error).message)); }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, status, method, gateway, source, walletUsed, from, to, amountMin, amountMax, sort]);

  const rows = data?.payments ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); allChecked ? rows.forEach((r) => n.delete(r.id)) : rows.forEach((r) => n.add(r.id)); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function exportCsv() {
    const chosen = rows.filter((r) => selected.has(r.id));
    const list = chosen.length ? chosen : rows;
    const head = ["Payment ID", "Transaction ID", "Order ID", "Subscription ID", "Customer", "Date", "Method", "Gateway", "Amount", "Wallet", "GST", "Discount", "Net", "Status", "Invoice", "Collected By"];
    const lines = [head, ...list.map((p) => [p.code, p.transactionId ?? "", p.orderId ?? "", p.subscriptionId ?? "", p.customer.name ?? p.customer.phone ?? "", p.createdAt.slice(0, 10), p.method, p.gateway, String(Math.round(p.amountPaise / 100)), String(Math.round(p.walletUsedPaise / 100)), String(Math.round(p.gstPaise / 100)), String(Math.round(p.discountPaise / 100)), String(Math.round(p.netPaise / 100)), p.status, p.invoiceNumber ?? "", p.collectedByName ?? ""])];
    const csv = lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `payments-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
    if (chosen.length) api("/api/admin/payments/bulk", { method: "POST", body: JSON.stringify({ ids: chosen.map((c) => c.id), action: "export" }) }).catch(() => {});
  }
  async function bulk(action: string) {
    const ids = [...selected]; if (!ids.length) return;
    try { const r = await api("/api/admin/payments/bulk", { method: "POST", body: JSON.stringify({ ids, action }) }); flash(`${r.result.count} payment(s) — ${action}`); setSelected(new Set()); reload(); }
    catch (e) { flash((e as Error).message); }
  }

  const collectedThisPage = rows.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.netPaise, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payment/txn/order/subscription/invoice/customer…" className={`${sel} min-w-[260px] flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="">All statuses</option>{["SUCCESS", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={sel}><option value="">All methods</option>{(facets?.methods ?? ["UPI", "CARD", "NETBANKING", "WALLET", "CASH"]).map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select value={gateway} onChange={(e) => setGateway(e.target.value)} className={sel}><option value="">All gateways</option>{(facets?.gateways ?? ["razorpay", "wallet", "cash", "manual"]).map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={sel}><option value="">All sources</option>{["ORDER", "SUBSCRIPTION", "AUTOPAY", "MANUAL", "B2B"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
        <label className="flex items-center gap-1 text-xs text-ink-3"><input type="checkbox" checked={walletUsed} onChange={(e) => setWalletUsed(e.target.checked)} /> Wallet used</label>
        <input value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="₹ min" className={`${sel} w-20`} />
        <input value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="₹ max" className={`${sel} w-20`} />
        <label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
        <label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}><option value="latest">Latest</option><option value="oldest">Oldest</option><option value="high">Highest ₹</option><option value="low">Lowest ₹</option><option value="customer">Customer A–Z</option></select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-leaf/30 bg-leaf/5 px-4 py-2 text-sm">
          <b className="text-forest">{selected.size} selected</b>
          <button onClick={() => bulk("reconcile")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Reconcile</button>
          <button onClick={() => bulk("receipts")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Send receipts</button>
          <button onClick={exportCsv} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Export CSV</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-ink-3 underline">clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr><th className="px-3 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              {["Payment", "Customer", "Source", "Method / gateway", "Amount", "Wallet", "Net", "Status", "Invoice", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-ink-3">No payments match these filters.</td></tr>}
            {rows.map((p) => (
              <Row key={p.id} p={p} checked={selected.has(p.id)} onCheck={() => toggle(p.id)} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} flash={flash} onChanged={reload} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{total} payment{total === 1 ? "" : "s"} · page collected {inr(collectedThisPage)}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
          <button disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}

function Row({ p, checked, onCheck, open, onToggle, flash, onChanged }: { p: PaymentListItem; checked: boolean; onCheck: () => void; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-b border-mint-soft/60 align-top">
        <td className="px-3 py-3"><input type="checkbox" checked={checked} onChange={onCheck} /></td>
        <td className="px-3 py-3"><div className="font-mono text-xs font-bold text-forest">{p.code}</div><div className="text-xs text-ink-3">{p.transactionId ?? p.orderId ?? "—"}</div><div className="text-xs text-ink-3">{fmtDate(p.createdAt)}</div></td>
        <td className="px-3 py-3"><div className="font-semibold text-forest">{p.customer.name ?? "—"}</div><div className="text-xs text-ink-3">{p.customer.phone ?? ""}</div></td>
        <td className="px-3 py-3 text-xs text-ink-2">{p.source.toLowerCase()}{p.reconciled ? " · ✓" : ""}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{p.method}<div className="text-ink-3">{p.gateway}</div></td>
        <td className="px-3 py-3 font-semibold text-forest">{inr(p.amountPaise)}</td>
        <td className="px-3 py-3 text-ink-2">{p.walletUsedPaise > 0 ? inr(p.walletUsedPaise) : "—"}</td>
        <td className="px-3 py-3 text-ink-2">{inr(p.netPaise)}{p.refundedPaise > 0 ? <div className="text-xs text-red-600">−{inr(p.refundedPaise)}</div> : null}</td>
        <td className="px-3 py-3"><Pill s={p.status} /></td>
        <td className="px-3 py-3 font-mono text-xs text-ink-3">{p.invoiceNumber ?? "—"}</td>
        <td className="px-3 py-3"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:bg-[#F6FAF6]">{open ? "Close" : "View"}</button></td>
      </tr>
      {open && <tr><td colSpan={11} className="bg-[#FAFCF9] px-3 py-4"><DetailPanel id={p.id} flash={flash} onChanged={onChanged} /></td></tr>}
    </>
  );
}

/* ============================= Detail ============================= */
function DetailPanel({ id, flash, onChanged }: { id: string; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<PaymentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api(`/api/admin/payments/${id}`).then((r) => setD(r.payment)).catch((e) => flash((e as Error).message)); }, [id, flash]);
  useEffect(() => { load(); }, [load]);

  async function mutate(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try { await api(`/api/admin/payments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); onChanged(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  if (!d) return <p className="text-sm text-ink-3">Loading payment…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3">
        <Card title="Customer & links">
          <p className="font-semibold text-forest">{d.customer.name ?? "—"}</p>
          <p className="text-xs text-ink-3">{d.customer.email ?? ""} · {d.customer.phone ?? ""}</p>
          {d.order && <p className="mt-1 text-xs">Order: <b className="text-forest">{d.order.type.toLowerCase()}</b> · {inr(d.order.totalPaise)} · {d.order.status.toLowerCase()}</p>}
          {d.subscription && <p className="text-xs">Subscription: <b className="text-forest">{d.subscription.plan}</b> · {d.subscription.status.toLowerCase()}</p>}
          {d.billing && <p className="text-xs">Billing: <b className="font-mono">{d.billing.code}</b> cycle {d.billing.cycleNumber} · {d.billing.paymentStatus.toLowerCase()}</p>}
          <p className="mt-1 text-xs text-ink-3">Source {d.source} · {d.method}/{d.gateway}{d.collectedByName ? ` · collected by ${d.collectedByName}` : ""}</p>
        </Card>
        <Card title="Payment breakdown" right={<button onClick={() => openReceiptPrint(d)} className="rounded-full border border-mint-soft px-2.5 py-1 text-[11px] font-semibold text-forest">Print / PDF</button>}>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between"><span className="text-ink-3">Amount (gross)</span><b className="text-forest">{inr2(d.amountPaise)}</b></div>
            {d.discountPaise > 0 && <div className="flex justify-between text-leaf-600"><span>Discount</span><b>−{inr2(d.discountPaise)}</b></div>}
            {d.gstPaise > 0 && <div className="flex justify-between"><span className="text-ink-3">GST</span><b className="text-forest">{inr2(d.gstPaise)}</b></div>}
            {d.walletUsedPaise > 0 && <div className="flex justify-between"><span className="text-ink-3">Wallet used</span><b className="text-forest">−{inr2(d.walletUsedPaise)}</b></div>}
            <div className="flex justify-between border-t border-mint-soft pt-1"><span className="text-ink-3">Net received</span><b className="text-forest">{inr2(d.netPaise)}</b></div>
            {d.refundedPaise > 0 && <div className="flex justify-between text-red-600"><span>Refunded</span><b>−{inr2(d.refundedPaise)}</b></div>}
            <div className="flex justify-between"><span className="text-ink-3">Invoice</span><b className="font-mono">{d.invoiceNumber ?? "—"}</b></div>
          </div>
        </Card>
        <Card title="Gateway response">
          <p className="text-xs text-ink-3">Order: <span className="font-mono">{d.gatewayOrderId ?? "—"}</span></p>
          <p className="text-xs text-ink-3">Payment: <span className="font-mono">{d.gatewayPaymentId ?? "—"}</span></p>
          {d.gatewayResponse ? <pre className="mt-1 max-h-28 overflow-auto rounded bg-[#F6FAF6] p-2 text-[10px] text-ink-2">{JSON.stringify(d.gatewayResponse, null, 1)}</pre> : <p className="text-xs text-ink-3">No raw gateway payload stored.</p>}
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Wallet activity">
          {d.walletTxns.length === 0 ? <p className="text-xs text-ink-3">No transactions.</p> : (
            <table className="w-full text-xs"><tbody>{d.walletTxns.slice(0, 6).map((w) => <tr key={w.id}><td className="py-0.5 text-ink-2">{w.description ?? w.kind}</td><td className={`py-0.5 text-right font-semibold ${w.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{w.type === "CREDIT" ? "+" : "−"}{inr(w.amountPaise)}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="Refund history">
          {d.refunds.length === 0 ? <p className="text-xs text-ink-3">No refunds.</p> : d.refunds.map((r) => <div key={r.id} className="flex justify-between text-xs"><span className="text-ink-2">{r.reason ?? "refund"}{r.toWallet ? " · wallet" : ""}</span><span className="text-red-600">−{inr(r.amountPaise)} · {fmtDate(r.createdAt)}</span></div>)}
        </Card>
        <Card title="Attempts">
          {d.attempts.length === 0 ? <p className="text-xs text-ink-3">No retry attempts.</p> : d.attempts.map((a) => <div key={a.id} className="flex justify-between text-xs"><span className="text-ink-2">#{a.attemptNo} {a.status.toLowerCase()}</span><span className="text-ink-3">{fmtDT(a.createdAt)}</span></div>)}
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Actions">
          <div className="flex flex-wrap gap-2">
            {(d.status === "SUCCESS" || d.status === "PARTIALLY_REFUNDED") && d.refundablePaise > 0 && (
              <RefundBtn busy={busy} maxPaise={d.refundablePaise} onRefund={(amt, reason, toWallet) => mutate({ action: "refund", amountPaise: amt, reason, toWallet }, "Refund processed")} />
            )}
            {(d.status === "PENDING" || d.status === "FAILED") && <button disabled={busy} onClick={() => mutate({ action: "retry" }, "Retry recorded")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Retry</button>}
            <button disabled={busy} onClick={() => mutate({ action: "receipt" }, "Receipt sent")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Send receipt</button>
            <button disabled={busy} onClick={() => mutate({ action: "reconcile" }, d.reconciled ? "Marked unreconciled" : "Marked reconciled")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">{d.reconciled ? "Unreconcile" : "Reconcile"}</button>
          </div>
        </Card>
        <Card title="Timeline">
          <ol className="space-y-2">
            {d.events.length === 0 && <li className="text-xs text-ink-3">No events.</li>}
            {d.events.map((e) => <li key={e.id} className="border-l-2 border-mint-soft pl-3 text-xs"><div className="font-semibold text-forest">{e.summary}</div><div className="text-ink-3">{fmtDT(e.createdAt)}{e.byRole ? ` · ${e.byRole}` : ""}</div></li>)}
          </ol>
        </Card>
        <Card title="Note">
          {d.notes && <pre className="mb-2 whitespace-pre-wrap text-xs text-ink-2">{d.notes}</pre>}
          <NoteBox busy={busy} onAdd={(t) => mutate({ action: "note", text: t }, "Note added")} />
        </Card>
      </div>
    </div>
  );
}

function RefundBtn({ busy, maxPaise, onRefund }: { busy: boolean; maxPaise: number; onRefund: (amt: number, reason: string, toWallet: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(String(Math.round(maxPaise / 100)));
  const [reason, setReason] = useState("");
  const [toWallet, setToWallet] = useState(true);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Refund</button>;
  return (
    <div className="w-full space-y-1 rounded-lg bg-red-50 p-2 text-xs">
      <div className="flex items-center gap-2">
        <label>₹ <input type="number" min={1} max={Math.round(maxPaise / 100)} value={amt} onChange={(e) => setAmt(e.target.value)} className="w-20 rounded border border-mint-soft px-2 py-1" /></label>
        <span className="text-ink-3">of {inr(maxPaise)}</span>
        <label className="flex items-center gap-1"><input type="checkbox" checked={toWallet} onChange={(e) => setToWallet(e.target.checked)} /> to wallet</label>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" className="w-full rounded border border-mint-soft px-2 py-1" />
      <div className="flex gap-2"><button disabled={busy} onClick={() => { onRefund(Math.round(Number(amt || 0) * 100), reason, toWallet); setOpen(false); }} className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white">Process</button><button onClick={() => setOpen(false)} className="text-ink-3">cancel</button></div>
    </div>
  );
}
function NoteBox({ busy, onAdd }: { busy: boolean; onAdd: (t: string) => void }) {
  const [text, setText] = useState("");
  return <div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded border border-mint-soft px-2 py-1 text-xs" /><button disabled={busy || !text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest disabled:opacity-40">Add</button></div>;
}

function openReceiptPrint(d: PaymentDetail) {
  const w = window.open("", "_blank", "width=720,height=900"); if (!w) return;
  const row = (l: string, v: string) => `<tr><td style="padding:4px 0;color:#5b6b5b">${l}</td><td style="padding:4px 0;text-align:right;font-weight:600">${v}</td></tr>`;
  w.document.write(`<!doctype html><html><head><title>${d.code} receipt</title><style>body{font-family:system-ui,sans-serif;color:#1f2d1f;max-width:560px;margin:32px auto;padding:0 24px}h1{color:#2e7d32;margin:0}small{color:#5b6b5b}table{width:100%;border-collapse:collapse;margin-top:16px}.tot{border-top:2px solid #2e7d32}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>DOODLY</h1><small>Farm-fresh A2 milk</small></div><div style="text-align:right"><b>Payment receipt</b><br><small>${d.code}</small><br><small>${fmtDate(d.createdAt)}</small></div></div>
  <hr style="margin:16px 0;border:none;border-top:1px solid #e3ece3"/>
  <p><b>${d.customer.name ?? "Customer"}</b><br><small>${d.customer.email ?? ""} ${d.customer.phone ?? ""}</small></p>
  <table><tbody>
  ${row("Method", `${d.method} / ${d.gateway}`)}
  ${d.gatewayPaymentId ? row("Gateway payment", d.gatewayPaymentId) : ""}
  ${d.transactionId ? row("Transaction", d.transactionId) : ""}
  ${d.invoiceNumber ? row("Invoice", d.invoiceNumber) : ""}
  ${row("Amount", inr2(d.amountPaise))}
  ${d.discountPaise ? row("Discount", "−" + inr2(d.discountPaise)) : ""}
  ${d.gstPaise ? row("GST", inr2(d.gstPaise)) : ""}
  ${d.walletUsedPaise ? row("Wallet used", "−" + inr2(d.walletUsedPaise)) : ""}
  </tbody><tbody class="tot">${row("<b>Net paid</b>", "<b>" + inr2(d.netPaise) + "</b>")}${d.refundedPaise ? row("Refunded", "−" + inr2(d.refundedPaise)) : ""}</tbody></table>
  <p style="margin-top:24px;color:#5b6b5b;font-size:12px">Status: ${d.status.replace(/_/g, " ").toLowerCase()} · Thank you for choosing DOODLY.</p>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/* ============================= Record Payment ============================= */
type Cust = { id: string; name: string | null; email: string | null; phone: string | null };
function RecordTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [customer, setCustomer] = useState<Cust | null>(null);
  const [orders, setOrders] = useState<{ id: string; type: string; totalPaise: number }[]>([]);
  const [billings, setBillings] = useState<{ id: string; code: string; cycleNumber: number; totalPaise: number }[]>([]);
  const [subs, setSubs] = useState<{ id: string; plan: string; status: string }[]>([]);
  const [orderId, setOrderId] = useState(""); const [billingId, setBillingId] = useState(""); const [subscriptionId, setSubscriptionId] = useState("");
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState(""); const [wallet, setWallet] = useState(""); const [gst, setGst] = useState(""); const [discount, setDiscount] = useState("");
  const [reference, setReference] = useState(""); const [invoice, setInvoice] = useState(""); const [notes, setNotes] = useState(""); const [markPaid, setMarkPaid] = useState(true);
  const [busy, setBusy] = useState(false);

  function search() { if (!q.trim()) return; api(`/api/admin/payments/options?q=${encodeURIComponent(q.trim())}`).then((r) => setCustomers(r.customers)).catch((e) => flash((e as Error).message)); }
  function pick(c: Cust) {
    setCustomer(c); setCustomers([]);
    api(`/api/admin/payments/options?userId=${c.id}`).then((r) => { setOrders(r.orders); setBillings(r.billings); setSubs(r.subscriptions); }).catch((e) => flash((e as Error).message));
  }
  const net = Math.max(0, Math.round(Number(amount || 0) * 100) - Math.round(Number(wallet || 0) * 100));

  async function submit() {
    if (!customer || !amount) { flash("Pick a customer and enter an amount."); return; }
    setBusy(true);
    try {
      await api("/api/admin/payments", { method: "POST", body: JSON.stringify({
        userId: customer.id, amountPaise: Math.round(Number(amount) * 100), method,
        orderId: orderId || undefined, billingId: billingId || undefined, subscriptionId: subscriptionId || undefined,
        walletUsedPaise: wallet ? Math.round(Number(wallet) * 100) : undefined, gstPaise: gst ? Math.round(Number(gst) * 100) : undefined, discountPaise: discount ? Math.round(Number(discount) * 100) : undefined,
        reference: reference || undefined, invoiceNumber: invoice || undefined, notes: notes || undefined, markPaid,
      }) });
      flash("Payment recorded"); onDone();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="1 · Customer">
        {customer ? <p className="flex items-center justify-between text-sm"><span className="font-semibold text-forest">{customer.name ?? customer.id}</span><button onClick={() => { setCustomer(null); setOrders([]); setBillings([]); setSubs([]); }} className="text-xs text-leaf-600 underline">change</button></p> : (
          <>
            <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search name / mobile / email" className={inp} /><button onClick={search} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">Search</button></div>
            {customers.map((c) => <button key={c.id} onClick={() => pick(c)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-mint-soft px-3 py-2 text-left text-sm hover:bg-[#F6FAF6]"><span>{c.name ?? "—"}</span><span className="text-xs text-ink-3">{c.phone ?? c.email}</span></button>)}
          </>
        )}
      </Card>
      {customer && (
        <>
          <Card title="2 · Link (optional)">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs">Order<select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inp}><option value="">—</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.type} · {inr(o.totalPaise)}</option>)}</select></label>
              <label className="block text-xs">Billing<select value={billingId} onChange={(e) => setBillingId(e.target.value)} className={inp}><option value="">—</option>{billings.map((b) => <option key={b.id} value={b.id}>{b.code} c{b.cycleNumber} · {inr(b.totalPaise)}</option>)}</select></label>
              <label className="block text-xs">Subscription<select value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} className={inp}><option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.plan} · {s.status.toLowerCase()}</option>)}</select></label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} /> Mark the linked order / billing as paid</label>
          </Card>
          <Card title="3 · Amount & method">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs">Method<select value={method} onChange={(e) => setMethod(e.target.value)} className={inp}>{["CASH", "UPI", "CARD", "NETBANKING", "WALLET"].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <label className="block text-xs">Amount ₹<input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={inp} /></label>
              <label className="block text-xs">Wallet used ₹<input type="number" min={0} value={wallet} onChange={(e) => setWallet(e.target.value)} className={inp} /></label>
              <label className="block text-xs">GST ₹<input type="number" min={0} value={gst} onChange={(e) => setGst(e.target.value)} className={inp} /></label>
              <label className="block text-xs">Discount ₹<input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className={inp} /></label>
              <label className="block text-xs">Reference no.<input value={reference} onChange={(e) => setReference(e.target.value)} className={inp} /></label>
              <label className="block text-xs">Invoice no.<input value={invoice} onChange={(e) => setInvoice(e.target.value)} className={inp} /></label>
              <label className="block text-xs sm:col-span-2">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label>
            </div>
          </Card>
          <div className="flex items-center justify-between rounded-2xl border border-mint-soft bg-white p-4">
            <div className="text-sm text-ink-3">Net to collect: <b className="text-forest">{inr(net)}</b></div>
            <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Record payment"}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================= Reports ============================= */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [r, setR] = useState<PaymentReports | null>(null);
  const range = useMemo(() => {
    if (preset === "custom") return { from, to };
    const start = new Date(); const end = todayISO();
    if (preset === "today") { /* today */ } else if (preset === "7") start.setDate(start.getDate() - 7);
    else if (preset === "30") start.setDate(start.getDate() - 30); else if (preset === "month") start.setDate(1);
    else if (preset === "year") { start.setMonth(0); start.setDate(1); }
    return { from: start.toISOString().slice(0, 10), to: end };
  }, [preset, from, to]);
  const load = useCallback(() => { const p = new URLSearchParams(); if (range.from) p.set("from", range.from); if (range.to) p.set("to", range.to); api(`/api/admin/payments/reports?${p.toString()}`).then(setR).catch((e) => flash((e as Error).message)); }, [range, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!r) return;
    const head = ["Payment ID", "Date", "Customer", "Method", "Gateway", "Source", "Status", "Amount", "Wallet", "GST", "Net", "Invoice"];
    const lines = [head, ...r.rows.map((x) => [x.code, x.date, x.customer, x.method, x.gateway, x.source, x.status, String(x.amountRupees), String(x.walletRupees), String(x.gstRupees), String(x.netRupees), x.invoice])];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `payments-report-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={sel}><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom</option></select>
        {preset === "custom" && <><label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label><label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label></>}
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest">Refresh</button>
        <button onClick={exportCsv} disabled={!r} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>
      {!r ? <p className="text-sm text-ink-3">Loading…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Gross revenue" value={inr(r.revenue.grossPaise)} />
            <Kpi label="Net collected" value={inr(r.revenue.netPaise)} />
            <Kpi label="GST collected" value={inr(r.revenue.gstPaise)} />
            <Kpi label="Refunds" value={inr(r.refunds.amountPaise)} sub={`${r.refunds.count} · ${inr(r.refunds.toWalletPaise)} to wallet`} />
            <Kpi label="Wallet used" value={inr(r.wallet.usedPaise)} />
            <Kpi label="Cashback / referral" value={`${inr(r.wallet.cashbackPaise)} / ${inr(r.wallet.referralPaise)}`} />
            <Kpi label="Auto-Pay collected" value={inr(r.autopay.collectedPaise)} sub={`${r.autopay.count} payments`} />
            <Kpi label="Discounts" value={inr(r.revenue.discountPaise)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="Daily collections" head={["Date", "Count", "Collected"]} rows={r.daily.map((x) => [x.date, String(x.count), inr(x.collectedPaise)])} />
            <ReportTable title="Monthly collections" head={["Month", "Count", "Collected"]} rows={r.monthly.map((x) => [x.month, String(x.count), inr(x.collectedPaise)])} />
            <ReportTable title="By method" head={["Method", "Count", "Collected"]} rows={r.byMethod.map((x) => [x.method, String(x.count), inr(x.collectedPaise)])} />
            <ReportTable title="By gateway" head={["Gateway", "Count", "Collected"]} rows={r.byGateway.map((x) => [x.gateway, String(x.count), inr(x.collectedPaise)])} />
            <ReportTable title="By status" head={["Status", "Count"]} rows={r.byStatus.map((x) => [x.status.replace(/_/g, " ").toLowerCase(), String(x.count)])} />
          </div>
        </>
      )}
    </div>
  );
}

/* ============================= Gateways ============================= */
function GatewaysTab({ flash }: { flash: (m: string) => void }) {
  const [gws, setGws] = useState<GatewayRow[] | null>(null);
  const load = useCallback(() => { api("/api/admin/payments/gateways").then((r) => setGws(r.gateways)).catch((e) => flash((e as Error).message)); }, [flash]);
  useEffect(() => { load(); }, [load]);
  async function setGw(name: string, data: Record<string, unknown>) { try { await api("/api/admin/payments/gateways", { method: "PATCH", body: JSON.stringify({ name, ...data }) }); flash("Gateway updated"); load(); } catch (e) { flash((e as Error).message); } }
  if (!gws) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">Configure gateways here; secrets stay in server environment variables (never sent to the browser).</p>
      {gws.map((g) => (
        <Card key={g.id} title={g.label} right={<button onClick={() => setGw(g.name, { enabled: !g.enabled })} className={`rounded-full px-3 py-1 text-xs font-semibold ${g.enabled ? "bg-leaf text-white" : "border border-mint-soft text-forest"}`}>{g.enabled ? "Enabled" : "Disabled"}</button>}>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <p>Mode: <b className="text-forest">{g.mode}</b> {g.name === "razorpay" && <button onClick={() => setGw(g.name, { mode: g.mode === "LIVE" ? "TEST" : "LIVE" })} className="ml-1 text-leaf-600 underline">switch</button>}</p>
            <p>Key ID: <span className="font-mono">{g.keyId ?? "—"}</span></p>
            <p>Refunds: {g.supportsRefund ? "supported" : "—"}</p>
            <p>Webhook: {g.webhookConfigured ? "configured" : "not configured"}</p>
          </div>
          {g.name === "razorpay" && (
            <div className="mt-2 rounded-lg bg-[#F6FAF6] p-2 text-xs">
              <p className={g.liveKeysPresent ? "text-leaf-600" : "text-amber-700"}>● API keys: {g.liveKeysPresent ? "present in environment" : "MISSING — set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET"}</p>
              <p className={g.webhookSecretPresent ? "text-leaf-600" : "text-amber-700"}>● Webhook secret: {g.webhookSecretPresent ? "present" : "MISSING — set RAZORPAY_WEBHOOK_SECRET"}</p>
              <p className="text-ink-3">Webhook URL: <span className="font-mono">/api/payments/webhook</span> · subscribe to payment.captured, payment.failed, subscription.charged/halted/cancelled.</p>
            </div>
          )}
        </Card>
      ))}
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
