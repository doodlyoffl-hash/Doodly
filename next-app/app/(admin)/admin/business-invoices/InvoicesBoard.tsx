"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InvoiceRow, InvoicesListResponse, InvoiceDetail, InvoiceDetailResponse, UninvoicedOrder, InvoiceReports } from "@/lib/b2b/invoice-types";

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

const PAY_TONE: Record<string, string> = { PAID: "bg-leaf text-white", PARTIAL: "bg-amber-50 text-amber-700", PENDING: "bg-blue-50 text-blue-700", OVERDUE: "bg-red-50 text-red-700", VOID: "bg-gray-100 text-gray-500" };
const ST_TONE: Record<string, string> = { ISSUED: "bg-blue-50 text-blue-700", PARTIAL: "bg-amber-50 text-amber-700", PAID: "bg-leaf text-white", VOID: "bg-gray-100 text-gray-500" };
const EMAIL_TONE: Record<string, string> = { SENT: "bg-leaf text-white", PENDING: "bg-blue-50 text-blue-700", FAILED: "bg-red-50 text-red-700", SKIPPED: "bg-gray-100 text-gray-500" };
const emailLabel = (s: string) => ({ SENT: "Sent", PENDING: "Pending", FAILED: "Failed", SKIPPED: "Skipped" }[s] ?? s);
const Pill = ({ s, map }: { s: string; map: Record<string, string> }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${map[s] ?? "bg-gray-100 text-gray-600"}`}>{s[0] + s.slice(1).toLowerCase()}</span>;

type Tab = "dashboard" | "invoices" | "create" | "reports";
const TABS: { key: Tab; label: string }[] = [{ key: "dashboard", label: "Dashboard" }, { key: "invoices", label: "Invoices" }, { key: "create", label: "Create Invoice" }, { key: "reports", label: "Reports" }];

export function InvoicesBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>)}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "invoices" && <InvoicesTab flash={flash} />}
      {tab === "create" && <CreateTab flash={flash} onDone={() => setTab("invoices")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

const Kpi = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-mint-soft bg-white p-5"><div className="font-display text-2xl font-bold text-leaf-600">{value}</div><div className="mt-1 text-sm text-ink-3">{label}</div></div>;

function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [r, setR] = useState<InvoiceReports | null>(null);
  useEffect(() => { api("/api/b2b/invoices/reports").then(setR).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!r) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Invoices" value={String(r.totalInvoices)} />
        <Kpi label="Revenue invoiced" value={inr(r.revenueInvoicedPaise)} />
        <Kpi label="Collected" value={inr(r.collectedPaise)} />
        <Kpi label="Outstanding" value={inr(r.outstandingPaise)} />
        <Kpi label="GST collected" value={inr(r.gstPaise)} />
        <Kpi label="Overdue" value={`${r.overdueCount} · ${inr(r.overduePaise)}`} />
        <Kpi label="Paid" value={String(r.byStatus.PAID ?? 0)} />
        <Kpi label="Void" value={String(r.byStatus.VOID ?? 0)} />
      </div>
      <ReportTable title="Business-wise invoicing" head={["Business", "Invoices", "Revenue", "Outstanding"]} rows={r.byBusiness.map((b) => [`${b.code ?? ""} ${b.name ?? ""}`.trim() || "—", String(b.count), inr(b.revenuePaise), inr(b.outstandingPaise)])} />
    </div>
  );
}

/* ===================== Invoices list ===================== */
const PAGE = 15;
function InvoicesTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amtFrom, setAmtFrom] = useState("");
  const [amtTo, setAmtTo] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<InvoicesListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const reset = () => setPage(0);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (overdue) p.set("overdue", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (amtFrom) p.set("amountFrom", amtFrom);
    if (amtTo) p.set("amountTo", amtTo);
    p.set("sort", sort); p.set("limit", String(PAGE)); p.set("offset", String(page * PAGE));
    return `/api/b2b/invoices?${p}`;
  }, [q, status, overdue, from, to, amtFrom, amtTo, sort, page]);
  const load = useCallback(async () => { try { setData(await api(url)); setError(null); } catch (e) { setError((e as Error).message); } }, [url]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.invoices ?? [];
  const total = data?.total ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search invoice #, business or GST…" className="min-w-[240px] flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-2 text-sm">{[["", "Any status"], ["ISSUED", "Issued"], ["PARTIAL", "Partial"], ["PAID", "Paid"], ["VOID", "Void"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-2 text-sm">
          <option value="latest">Latest</option><option value="oldest">Oldest</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option><option value="business">Business name</option><option value="due">Due date</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); reset(); }} /> Overdue only</label>
        <span className="ml-2 font-semibold uppercase tracking-wide">Date</span>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-1.5 text-sm" /><span>→</span><input type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} className="rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        <span className="ml-2 font-semibold uppercase tracking-wide">Amount ₹</span>
        <input value={amtFrom} onChange={(e) => { setAmtFrom(e.target.value); reset(); }} placeholder="min" inputMode="decimal" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" /><span>–</span><input value={amtTo} onChange={(e) => { setAmtTo(e.target.value); reset(); }} placeholder="max" inputMode="decimal" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        {(q || status || overdue || from || to || amtFrom || amtTo) && <button onClick={() => { setQ(""); setStatus(""); setOverdue(false); setFrom(""); setTo(""); setAmtFrom(""); setAmtTo(""); reset(); }} className="text-leaf-600 underline">Clear</button>}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Invoice #", "Business", "GST", "Date", "Due", "Total", "Paid", "Payment", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((iv) => <InvoiceRowView key={iv.id} iv={iv} open={openId === iv.id} onToggle={() => setOpenId(openId === iv.id ? null : iv.id)} flash={flash} onChanged={load} />)}
            {!rows.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-ink-3">No invoices found. Use “Create Invoice” to issue one.</td></tr>}
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

function InvoiceRowView({ iv, open, onToggle, flash, onChanged }: { iv: InvoiceRow; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<InvoiceDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");

  const loadDetail = useCallback(async () => { try { const j: InvoiceDetailResponse = await api(`/api/b2b/invoices/${iv.id}`); setD(j.invoice); } catch (e) { flash((e as Error).message); } }, [iv.id, flash]);
  useEffect(() => { if (open) loadDetail(); else setD(null); }, [open, loadDetail]);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try { await api(`/api/b2b/invoices/${iv.id}`, { method: "PATCH", body: JSON.stringify(body) }); flash(ok); await loadDetail(); onChanged(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function printPdf() {
    setBusy(true);
    try { let dd = d; if (!dd) { const j: InvoiceDetailResponse = await api(`/api/b2b/invoices/${iv.id}`); dd = j.invoice; setD(dd); } openInvoicePrint(dd!); await api(`/api/b2b/invoices/${iv.id}`, { method: "PATCH", body: JSON.stringify({ action: "pdf" }) }); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <tr className="border-b border-mint-soft/60 hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-mono text-xs font-semibold text-forest">{iv.number}</td>
        <td className="px-4 py-3"><div className="font-semibold text-forest">{iv.businessName}</div><div className="text-xs text-ink-3">{iv.businessCode}</div></td>
        <td className="px-4 py-3 text-xs text-ink-3">{iv.gst ?? "—"}</td>
        <td className="px-4 py-3 text-ink-2">{fmtDate(iv.issuedAt)}</td>
        <td className="px-4 py-3 text-ink-2">{fmtDate(iv.dueDate)}</td>
        <td className="px-4 py-3 font-semibold text-forest">{inr(iv.totalPaise)}</td>
        <td className="px-4 py-3 text-ink-2">{inr(iv.paidPaise)}</td>
        <td className="px-4 py-3"><Pill s={iv.paymentStatus} map={PAY_TONE} /></td>
        <td className="px-4 py-3"><Pill s={iv.status} map={ST_TONE} /></td>
        <td className="px-4 py-3 text-right"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]"><td colSpan={10} className="px-4 py-5">
          {d ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Billed to</p>
                  <p className="font-semibold text-forest">{d.business.name} · {d.business.code}</p>
                  <p className="text-ink-2">{d.business.contactPerson} · {d.business.mobile}</p>
                  <p className="text-ink-2">{d.business.billingAddress || `${d.business.line1}, ${d.business.city} ${d.business.pincode}`}</p>
                  {d.business.gst && <p className="text-ink-3">GST: {d.business.gst}{d.business.pan ? ` · PAN: ${d.business.pan}` : ""}</p>}
                </div>
                <div className="rounded-xl border border-mint-soft bg-white p-3">
                  {d.items.map((i) => <div key={i.id} className="flex justify-between"><span className="text-ink-2">{i.quantity} {i.unit} {i.productName}</span><span className="font-semibold">{inr(i.lineTotalPaise)}</span></div>)}
                  <div className="mt-2 border-t border-mint-soft pt-2 text-xs">
                    <div className="flex justify-between"><span>Subtotal</span><span>{inr(d.order.subtotalPaise)}</span></div>
                    <div className="flex justify-between"><span>Discount</span><span>– {inr(d.order.discountPaise)}</span></div>
                    <div className="flex justify-between"><span>GST</span><span>{inr(d.order.taxPaise)}</span></div>
                    <div className="flex justify-between font-bold text-forest"><span>Total</span><span>{inr(d.order.totalPaise)}</span></div>
                    <div className="flex justify-between"><span>Paid</span><span>{inr(d.order.paidPaise)}</span></div>
                    <div className="flex justify-between"><span>Outstanding</span><span>{inr(d.order.totalPaise - d.order.paidPaise)}</span></div>
                  </div>
                </div>
                {d.payments.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wide text-ink-3">Payments</p>{d.payments.map((p) => <div key={p.id} className="flex justify-between text-xs text-ink-2"><span>{p.method}{p.reference ? ` · ${p.reference}` : ""} · {fmtDate(p.createdAt)}</span><span className="font-semibold text-forest">{inr(p.amountPaise)}</span></div>)}</div>}
              </div>

              <div className="space-y-4">
                {d.status !== "VOID" && d.status !== "PAID" && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Record payment</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount ₹" inputMode="decimal" className="w-28 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-mint-soft px-2 py-1.5 text-sm">{["Bank Transfer", "Cash", "UPI", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}</select>
                      <button disabled={busy || !payAmt} onClick={() => { patch({ action: "pay", amountPaise: Math.round((Number(payAmt) || 0) * 100), method: payMethod }, "Payment recorded"); setPayAmt(""); }} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={printPdf} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Print</button>
                  <a href={`/api/b2b/invoices/${iv.id}/pdf?dl=1`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Download PDF</a>
                  {d.status !== "VOID" && <button disabled={busy} onClick={() => patch({ action: "resend-email" }, "Invoice email sent")} className="rounded-full border border-leaf px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">{d.email?.status === "SENT" ? "Resend email" : "Send email"}</button>}
                  {d.status !== "VOID" && <button disabled={busy} onClick={() => { if (confirm("Void this invoice? This cannot be undone.")) patch({ action: "void" }, "Invoice voided"); }} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">Void invoice</button>}
                </div>
                {d.status !== "VOID" && <EditMeta d={d} busy={busy} onSave={(patchBody) => patch({ action: "update", patch: patchBody }, "Invoice updated")} />}
                {d.email && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Invoice email</p>
                    <div className="mt-1.5 rounded-xl border border-mint-soft bg-white p-3 text-xs">
                      <div className="flex items-center justify-between"><span className="font-semibold text-forest">Delivery status</span><span className={`rounded-full px-2.5 py-0.5 font-bold ${EMAIL_TONE[d.email.status] ?? "bg-gray-100 text-gray-600"}`}>{emailLabel(d.email.status)}</span></div>
                      {d.email.to && <div className="mt-1 flex justify-between"><span className="text-ink-3">Sent to</span><span className="text-ink-2">{d.email.to}</span></div>}
                      {d.email.sentAt && <div className="flex justify-between"><span className="text-ink-3">Sent at</span><span className="text-ink-2">{fmtDT(d.email.sentAt)}</span></div>}
                      {d.email.messageId && <div className="flex justify-between gap-2"><span className="text-ink-3">Message ID</span><span className="truncate font-mono text-ink-2" title={d.email.messageId}>{d.email.messageId}</span></div>}
                      {d.email.retryCount > 0 && <div className="flex justify-between"><span className="text-ink-3">Attempts</span><span className="text-ink-2">{d.email.retryCount}</span></div>}
                      {d.email.error && <p className="mt-1 text-red-600">{d.email.error}</p>}
                      {!d.business.email && <p className="mt-1 text-amber-700">No email on file for this business — add one on the business, then resend.</p>}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Audit trail &amp; email history</p>
                  <ol className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
                    {d.events.map((e) => <li key={e.id} className="rounded-lg border border-mint-soft bg-white px-3 py-1.5 text-xs"><div className="flex justify-between"><span className="font-semibold text-forest">{e.type[0].toUpperCase() + e.type.slice(1)}{e.byRole ? ` · ${e.byRole}` : ""}</span><span className="text-ink-3">{fmtDT(e.createdAt)}</span></div>{e.note && <p className="text-ink-2">{e.note}</p>}</li>)}
                  </ol>
                </div>
              </div>
            </div>
          ) : <p className="text-sm text-ink-3">Loading…</p>}
        </td></tr>
      )}
    </>
  );
}

function EditMeta({ d, busy, onSave }: { d: InvoiceDetail; busy: boolean; onSave: (patch: { dueDate?: string | null; notes?: string; terms?: string }) => void }) {
  const [due, setDue] = useState(d.dueDate ? d.dueDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(d.notes ?? "");
  const [terms, setTerms] = useState(d.terms ?? "");
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Invoice details</p>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-3">Due date<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inp} mt-1`} /></label>
        <label className="text-xs text-ink-3">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">Terms &amp; conditions<input value={terms} onChange={(e) => setTerms(e.target.value)} className={`${inp} mt-1`} placeholder="Payment due within terms; goods once sold…" /></label>
      </div>
      <button disabled={busy} onClick={() => onSave({ dueDate: due ? new Date(due).toISOString() : null, notes, terms })} className="mt-2 rounded-full bg-leaf px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save details</button>
    </div>
  );
}

/* ===================== Create invoice ===================== */
function CreateTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [orders, setOrders] = useState<UninvoicedOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due as per agreed terms. Goods once sold will not be taken back.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => api("/api/b2b/invoices/uninvoiced").then((j) => setOrders(j.orders)).catch((e) => flash((e as Error).message)), [flash]);
  useEffect(() => { reload(); }, [reload]);
  const picked = orders.find((o) => o.id === orderId);

  async function submit() {
    if (!orderId) { setErr("Select an order to invoice"); return; }
    setBusy(true); setErr(null);
    try { const j = await api("/api/b2b/invoices", { method: "POST", body: JSON.stringify({ orderId, dueDate: due ? new Date(due).toISOString() : undefined, notes: notes || undefined, terms: terms || undefined }) }); flash(`Invoice ${j.invoice.number} issued`); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-mint-soft bg-white p-4">
        <p className="mb-2 text-sm font-bold text-forest">1. Choose an order to invoice</p>
        {orders.length === 0 ? <p className="text-sm text-ink-3">Every B2B order already has an invoice. Create a new B2B order first.</p> : (
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inp}>
            <option value="">Select an uninvoiced order…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.businessName} · {inr(o.totalPaise)} ({o.itemsSummary})</option>)}
          </select>
        )}
      </div>
      {picked && (
        <div className="rounded-2xl border border-mint-soft bg-white p-4">
          <p className="mb-2 text-sm font-bold text-forest">2. Invoice details</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-3">Due date (optional — defaults to payment terms)<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inp} mt-1`} /></label>
            <label className="text-xs text-ink-3">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1`} /></label>
            <label className="text-xs text-ink-3 sm:col-span-2">Terms &amp; conditions<input value={terms} onChange={(e) => setTerms(e.target.value)} className={`${inp} mt-1`} /></label>
          </div>
          <div className="mt-3 rounded-xl bg-[#F6FAF6] px-4 py-3 text-sm"><div className="flex justify-between"><span className="text-ink-2">{picked.businessName} · {picked.itemsSummary}</span><span className="font-bold text-forest">{inr(picked.totalPaise)}</span></div></div>
        </div>
      )}
      {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
      <button disabled={busy || !orderId} onClick={submit} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Issuing…" : "Issue invoice"}</button>
    </div>
  );
}

/* ===================== Reports ===================== */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [r, setR] = useState<InvoiceReports | null>(null);
  const load = useCallback(async () => { try { const qs = new URLSearchParams(); if (from) qs.set("from", from); if (to) qs.set("to", to); setR(await api(`/api/b2b/invoices/reports?${qs}`)); } catch (e) { flash((e as Error).message); } }, [from, to, flash]);
  useEffect(() => { load(); }, [load]);
  function exportCsv() {
    if (!r) return;
    const lines: (string | number)[][] = [
      ["B2B Invoice Report"], ["Range", from || "all", to || "all"], [],
      ["Total invoices", r.totalInvoices], ["Revenue invoiced (₹)", (r.revenueInvoicedPaise / 100).toFixed(2)], ["Collected (₹)", (r.collectedPaise / 100).toFixed(2)], ["Outstanding (₹)", (r.outstandingPaise / 100).toFixed(2)], ["GST (₹)", (r.gstPaise / 100).toFixed(2)], ["Overdue", r.overdueCount], [],
      ["By business"], ["Business ID", "Name", "Invoices", "Revenue (₹)", "Outstanding (₹)"], ...r.byBusiness.map((b) => [b.code ?? "", b.name ?? "", b.count, (b.revenuePaise / 100).toFixed(2), (b.outstandingPaise / 100).toFixed(2)]),
    ];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `b2b-invoices-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-3">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1`} /></label>
        <label className="text-xs text-ink-3">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inp} mt-1`} /></label>
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">Apply</button>
        <button onClick={exportCsv} disabled={!r} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>
      {r && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Invoices" value={String(r.totalInvoices)} /><Kpi label="Revenue" value={inr(r.revenueInvoicedPaise)} /><Kpi label="Outstanding" value={inr(r.outstandingPaise)} /><Kpi label="GST" value={inr(r.gstPaise)} /></div>
          <ReportTable title="Business-wise" head={["Business", "Invoices", "Revenue", "Outstanding"]} rows={r.byBusiness.map((b) => [`${b.code ?? ""} ${b.name ?? ""}`.trim() || "—", String(b.count), inr(b.revenuePaise), inr(b.outstandingPaise)])} />
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
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-mint-soft/60">{row.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? "text-ink-2" : "text-forest"}`}>{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">No data</td></tr>}</tbody>
      </table>
    </div>
  );
}

/* clean printable / downloadable (Save as PDF) B2B tax invoice */
function openInvoicePrint(d: InvoiceDetail) {
  const w = window.open("", "_blank", "width=840,height=920");
  if (!w) return;
  const b = d.business;
  const itemRows = d.items.map((i) => `<tr><td>${i.productName}</td><td>${i.quantity} ${i.unit}</td><td class="r">${inr(i.unitPricePaise)}</td><td class="r">${inr(i.lineTotalPaise)}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${d.number}</title><style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2722;margin:32px}h1{color:#0F3D2E;margin:0 0 2px}.muted{color:#6b7b73;font-size:12px}.row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #e7ece9;text-align:left}th{background:#F6FAF6;font-size:11px;text-transform:uppercase;color:#6b7b73}.r{text-align:right}.totals{margin-top:14px;margin-left:auto;width:280px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:3px 0}.totals .tot{font-weight:800;color:#0F3D2E;border-top:1px solid #e7ece9;margin-top:4px;padding-top:8px}.badge{display:inline-block;background:#E4F6EC;color:#178a52;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700}${d.status === "VOID" ? ".void{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);font-size:90px;color:rgba(220,0,0,.12);font-weight:900}" : ""}</style></head><body>
    ${d.status === "VOID" ? '<div class="void">VOID</div>' : ""}
    <div class="row"><div><h1>DOODLY</h1><div class="muted">Fresh A2 Buffalo Milk · Vijayawada</div></div>
    <div style="text-align:right"><div style="font-weight:800;color:#0F3D2E">TAX INVOICE</div><div class="muted">${d.number}</div><div class="muted">Issued ${fmtDate(d.issuedAt)}${d.dueDate ? ` · Due ${fmtDate(d.dueDate)}` : ""}</div></div></div>
    <div class="row"><div><div class="muted">Billed to</div><b>${b.name}</b><div>${b.contactPerson} · ${b.mobile}</div><div>${b.billingAddress || `${b.line1}, ${b.city} ${b.pincode}`}</div>${b.gst ? `<div class="muted">GST: ${b.gst}${b.pan ? ` · PAN: ${b.pan}` : ""}</div>` : ""}</div>
    <div style="text-align:right"><div class="muted">Order</div><b>${d.order.code}</b><div><span class="badge">${d.paymentStatus}</span></div></div></div>
    <table><thead><tr><th>Product</th><th>Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <div class="totals"><div><span>Subtotal</span><span>${inr(d.order.subtotalPaise)}</span></div><div><span>Discount</span><span>– ${inr(d.order.discountPaise)}</span></div><div><span>GST</span><span>${inr(d.order.taxPaise)}</span></div><div class="tot"><span>Total</span><span>${inr(d.order.totalPaise)}</span></div><div><span>Paid</span><span>${inr(d.order.paidPaise)}</span></div><div><span>Outstanding</span><span>${inr(d.order.totalPaise - d.order.paidPaise)}</span></div></div>
    ${d.terms ? `<p class="muted" style="margin-top:24px"><b>Terms:</b> ${d.terms}</p>` : ""}${d.notes ? `<p class="muted">${d.notes}</p>` : ""}
    <p class="muted" style="margin-top:18px">This is a computer-generated invoice.</p></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
}
