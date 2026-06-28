"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EXPENSE_PAYMENT_MODES, PAYMENT_MODE_LABEL, EXPENSE_STATUSES, EXPENSE_STATUS_LABEL,
  allowedNextExpenseStatus, computeExpenseTotal, type ExpensePaymentMode, type ExpenseStatus, type DatePreset,
} from "@/lib/expenses/engine";
import type {
  CategoryRow, StaffRow, ExpenseRow, ExpenseDetail, DashboardResponse, ReportsResponse,
} from "@/lib/expenses/dashboard-types";

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrShort = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

type Tab = "dashboard" | "expenses" | "add" | "categories" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "expenses", label: "Expenses" },
  { key: "add", label: "Add Expense" },
  { key: "categories", label: "Categories" },
  { key: "reports", label: "Reports" },
];

export function ExpensesBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); }, []);

  const role = useMemo(() => {
    if (typeof document === "undefined") return "";
    return document.cookie.match(/(?:^|;\s*)doodly-role=([^;]+)/)?.[1] ?? "";
  }, []);
  const canApprove = role === "admin" || role === "super_admin";
  const canManage = role === "admin" || role === "super_admin";

  // categories shared across tabs
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const loadCategories = useCallback(async () => {
    try { const j = await api("/api/expenses/categories?includeInactive=1"); setCategories(j.categories); }
    catch (e) { flash((e as Error).message); }
  }, [flash]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

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

      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "expenses" && <ExpensesTab flash={flash} categories={categories.filter((c) => c.active)} canApprove={canApprove} />}
      {tab === "add" && <AddExpenseTab flash={flash} categories={categories.filter((c) => c.active)} onDone={() => setTab("expenses")} />}
      {tab === "categories" && <CategoriesTab flash={flash} categories={categories} canManage={canManage} reload={loadCategories} />}
      {tab === "reports" && <ReportsTab flash={flash} categories={categories} />}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================ Dashboard ============================ */

function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [d, setD] = useState<DashboardResponse | null>(null);
  useEffect(() => { api("/api/expenses/dashboard").then(setD).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!d) return <p className="text-sm text-ink-3">Loading…</p>;

  const cards = [
    { label: "Today's Expenses", value: inr(d.cards.todayPaise), sub: `${d.cards.todayCount} entries` },
    { label: "This Week", value: inr(d.cards.weekPaise) },
    { label: "This Month", value: inr(d.cards.monthPaise), sub: `${d.cards.monthCount} entries` },
    { label: "Pending Approvals", value: String(d.cards.pendingApprovals), accent: d.cards.pendingApprovals > 0 },
    { label: "Paid", value: inr(d.cards.paidPaise) },
    { label: "Outstanding", value: inr(d.cards.outstandingPaise), accent: d.cards.outstandingPaise > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border bg-white p-4 ${c.accent ? "border-gold" : "border-mint-soft"}`}>
            <p className="font-display text-xl font-bold text-forest">{c.value}</p>
            <p className="mt-0.5 text-xs text-ink-3">{c.label}</p>
            {c.sub && <p className="text-[11px] text-ink-3">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Daily expense trend (14 days)">
          <BarChart data={d.dailyTrend.map((x) => ({ label: x.date.slice(5), value: x.totalPaise }))} />
        </Panel>
        <Panel title="Monthly expense trend (6 months)">
          <BarChart data={d.monthlyTrend.map((x) => ({ label: x.month.slice(2), value: x.totalPaise }))} />
        </Panel>
        <Panel title="Category-wise spending (this month)">
          <BreakdownBars rows={d.categoryBreakdown.map((c) => ({ label: c.name, value: c.totalPaise }))} />
        </Panel>
        <Panel title="Payment mode (this month)">
          <BreakdownBars rows={d.paymentModeBreakdown.map((m) => ({ label: PAYMENT_MODE_LABEL[m.mode as ExpensePaymentMode] ?? m.mode, value: m.totalPaise }))} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-mint-soft bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</p>
      {children}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.some((d) => d.value > 0)) return <p className="py-8 text-center text-sm text-ink-3">No spending in this period.</p>;
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center justify-end" title={`${d.label}: ${inr(d.value)}`}>
          <div className="w-full rounded-t bg-leaf transition group-hover:bg-forest" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
          <span className="mt-1 truncate text-[9px] text-ink-3">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function BreakdownBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-3">No data.</p>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs"><span className="text-ink-2">{r.label}</span><span className="font-semibold text-forest">{inr(r.value)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-mint-soft"><div className="h-full rounded-full bg-leaf" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ============================ Expenses list ============================ */

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "All" }, { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7d" }, { key: "last30", label: "Last 30d" }, { key: "thisMonth", label: "This month" }, { key: "lastMonth", label: "Last month" },
];

function ExpensesTab({ flash, categories, canApprove }: { flash: (m: string) => void; categories: CategoryRow[]; canApprove: boolean }) {
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (preset) sp.set("preset", preset);
      if (categoryId) sp.set("categoryId", categoryId);
      if (mode) sp.set("paymentMode", mode);
      if (status) sp.set("status", status);
      if (min) sp.set("min", min);
      if (max) sp.set("max", max);
      if (q.trim()) sp.set("q", q.trim());
      const j = await api(`/api/expenses?${sp}`); setRows(j.expenses); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [preset, categoryId, mode, status, min, max, q]);
  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, r) => s + r.totalPaise, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${preset === p.key ? "bg-leaf text-white" : "border border-mint-soft text-forest hover:border-leaf"}`}>{p.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selCls}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={selCls}><option value="">All modes</option>{EXPENSE_PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}><option value="">All statuses</option>{EXPENSE_STATUSES.map((s) => <option key={s} value={s}>{EXPENSE_STATUS_LABEL[s]}</option>)}</select>
        <input value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min ₹" inputMode="numeric" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        <input value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max ₹" inputMode="numeric" className="w-20 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, vendor…" className="min-w-[180px] flex-1 rounded-lg border border-mint-soft px-3 py-1.5 text-sm" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-between text-sm">
        <p className="text-ink-3">{rows.length} expense{rows.length === 1 ? "" : "s"}</p>
        <p className="font-semibold text-forest">Total: {inr(total)}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Expense ID", "Date", "Name", "Category", "Vendor", "Amount", "Mode", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => <ExpenseRowView key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} flash={flash} canApprove={canApprove} onChanged={load} />)}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-3">No expenses match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<ExpenseStatus, string> = {
  PENDING_APPROVAL: "bg-gold-soft text-gold", APPROVED: "bg-mint-soft text-leaf-600", PAID: "bg-leaf text-white",
  PARTIALLY_PAID: "bg-gold-soft text-gold", REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-ink-3/10 text-ink-3",
};
function StatusBadge({ s }: { s: ExpenseStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[s]}`}>{EXPENSE_STATUS_LABEL[s]}</span>;
}

function ExpenseRowView({ r, open, onToggle, flash, canApprove, onChanged }: {
  r: ExpenseRow; open: boolean; onToggle: () => void; flash: (m: string) => void; canApprove: boolean; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const [payMode, setPayMode] = useState<ExpensePaymentMode>("CASH");

  const loadDetail = useCallback(() => { api(`/api/expenses/${r.id}`).then((j) => setDetail(j.expense)).catch((e) => flash((e as Error).message)); }, [r.id, flash]);
  useEffect(() => { if (open) loadDetail(); }, [open, loadDetail]);

  async function act(body: Record<string, unknown>, ok: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    try { await api(`/api/expenses/${r.id}`, { method: "PATCH", body: JSON.stringify(body) }); flash(ok); onChanged(); if (open) loadDetail(); }
    catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  const next = allowedNextExpenseStatus(r.status);
  const outstanding = r.totalPaise - r.paidPaise;

  return (
    <>
      <tr className="border-b border-mint-soft/60 hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-semibold text-forest">{r.code}</td>
        <td className="px-4 py-3 text-ink-2">{fmtDate(r.date)}</td>
        <td className="px-4 py-3">{r.title}{r._count?.attachments ? <span className="ml-1 text-xs text-ink-3">📎{r._count.attachments}</span> : null}</td>
        <td className="px-4 py-3 text-ink-2">{r.category.name}</td>
        <td className="px-4 py-3 text-ink-2">{r.vendor ?? "—"}</td>
        <td className="px-4 py-3 font-semibold">{inr(r.totalPaise)}</td>
        <td className="px-4 py-3 text-ink-2">{PAYMENT_MODE_LABEL[r.paymentMode]}</td>
        <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
        <td className="px-4 py-3 text-right"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "View"}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]"><td colSpan={9} className="px-4 py-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-1.5 text-sm text-ink-2">
              <Detail k="Purpose" v={detail?.description ?? "—"} />
              <Detail k="Invoice / Bill" v={r.invoiceNo ?? "—"} />
              <Detail k="Amount (base)" v={inr(r.amountPaise)} />
              <Detail k="GST" v={r.gstPaise ? `${inr(r.gstPaise)} ${r.gstIncluded ? "(included)" : "(added)"}` : "—"} />
              <Detail k="Total" v={inr(r.totalPaise)} />
              <Detail k="Paid / Outstanding" v={`${inr(r.paidPaise)} / ${inr(outstanding)}`} />
              <Detail k="Requested by" v={r.requestedBy ?? "—"} />
              <Detail k="Approved by" v={r.approvedBy ?? "—"} />
              <Detail k="Paid by" v={r.paidBy ?? "—"} />
              <Detail k="Notes" v={r.notes ?? "—"} />
              {detail?.attachments?.length ? (
                <div className="pt-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Documents</p>
                  <ul className="mt-1 space-y-1">{detail.attachments.map((a) => (
                    <li key={a.id} className="text-xs">📄 {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-leaf-600 underline">{a.name}</a> : a.name} <span className="text-ink-3">· {a.kind}{a.sizeBytes ? ` · ${(a.sizeBytes / 1024).toFixed(0)} KB` : ""}</span></li>
                  ))}</ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Workflow</p>
                <div className="flex flex-wrap gap-2">
                  {r.status === "PENDING_APPROVAL" && canApprove && (
                    <>
                      <button disabled={busy} onClick={() => act({ action: "approve" }, "Expense approved")} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve →</button>
                      <button disabled={busy} onClick={() => act({ action: "reject", reason: prompt("Reason for rejection?") ?? undefined }, "Expense rejected")} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">Reject</button>
                    </>
                  )}
                  {(r.status === "APPROVED" || r.status === "PARTIALLY_PAID") && (
                    <button disabled={busy} onClick={() => act({ action: "markPaid" }, "Marked as paid")} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Mark fully paid</button>
                  )}
                  {next.includes("CANCELLED") && canApprove && (
                    <button disabled={busy} onClick={() => act({ action: "cancel" }, "Expense cancelled", "Cancel this expense?")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-50">Cancel</button>
                  )}
                  <button onClick={() => window.print()} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Print</button>
                  {canApprove && <button disabled={busy} onClick={() => act({ action: "delete" }, "Expense deleted", "Soft-delete this expense? History is retained.")} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">Delete</button>}
                </div>
                {!canApprove && r.status === "PENDING_APPROVAL" && <p className="mt-1 text-xs text-ink-3">Awaiting Admin/Super-Admin approval.</p>}
              </div>

              {(r.status === "APPROVED" || r.status === "PARTIALLY_PAID") && (
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Record payment (outstanding {inr(outstanding)})</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount ₹" inputMode="decimal" className="w-28 rounded-lg border border-mint-soft px-2 py-1.5 text-sm" />
                    <select value={payMode} onChange={(e) => setPayMode(e.target.value as ExpensePaymentMode)} className={selCls}>{EXPENSE_PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</option>)}</select>
                    <button disabled={busy || !payAmt} onClick={() => { act({ action: "pay", payment: { amountPaise: Math.round((Number(payAmt) || 0) * 100), mode: payMode } }, "Payment recorded"); setPayAmt(""); }} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Add</button>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Audit trail</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {detail?.auditLogs?.map((a) => (
                    <div key={a.id} className="rounded-lg border border-mint-soft bg-white px-3 py-1.5 text-xs">
                      <span className="font-semibold text-forest">{a.action}</span>{a.actorName ? ` · ${a.actorName}` : ""} <span className="text-ink-3">· {fmtDateTime(a.createdAt)}</span>
                      {a.detail && <div className="text-ink-3">{a.detail}</div>}
                    </div>
                  )) ?? <p className="text-xs text-ink-3">Loading…</p>}
                </div>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ============================ Add expense ============================ */

interface DraftAttachment { name: string; kind: string; mime: string; sizeBytes: number }

function AddExpenseTab({ flash, categories, onDone }: { flash: (m: string) => void; categories: CategoryRow[]; onDone: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [paymentMode, setPaymentMode] = useState<ExpensePaymentMode>("CASH");
  const [amount, setAmount] = useState("");
  const [gstIncluded, setGstIncluded] = useState(false);
  const [gst, setGst] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { if (!categoryId && categories[0]) setCategoryId(categories[0].id); }, [categories, categoryId]);
  useEffect(() => { api("/api/expenses/staff").then((j) => setStaff(j.staff)).catch(() => {}); }, []);

  const totals = computeExpenseTotal({ amountPaise: Math.round((Number(amount) || 0) * 100), gstIncluded, gstPaise: Math.round((Number(gst) || 0) * 100) });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const drafts: DraftAttachment[] = Array.from(list).map((f) => ({
      name: f.name, mime: f.type, sizeBytes: f.size,
      kind: f.type.includes("pdf") ? "pdf" : f.type.startsWith("image/") ? "image" : "other",
    }));
    setFiles((s) => [...s, ...drafts].slice(0, 20));
  }

  async function submit() {
    if (!title.trim()) { flash("Enter an expense title"); return; }
    if (!categoryId) { flash("Select a category"); return; }
    if (!(Number(amount) > 0)) { flash("Enter an amount"); return; }
    setBusy(true);
    try {
      const payload = {
        date, title, categoryId, description, vendor, invoiceNo, paymentMode,
        amountPaise: Math.round((Number(amount) || 0) * 100), gstIncluded, gstPaise: Math.round((Number(gst) || 0) * 100),
        requestedBy, approvedBy, paidBy, notes,
        attachments: files.map((f) => ({ name: f.name, kind: f.kind, mime: f.mime, sizeBytes: f.sizeBytes })),
      };
      const j = await api("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
      flash(`Expense ${j.expense.code} created`); onDone();
    } catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  const staffOptions = (extra: string) => (
    <>
      <option value="">— select / type —</option>
      {staff.map((s) => <option key={s.id} value={s.name ?? s.id}>{s.name ?? s.id} ({s.role})</option>)}
      {extra && !staff.some((s) => (s.name ?? s.id) === extra) && <option value={extra}>{extra}</option>}
    </>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <Section title="Basic details">
        <Field label="Expense date *"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inpCls} /></Field>
        <Field label="Expense name / title *"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inpCls} /></Field>
        <Field label="Category *"><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inpCls}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Vendor / payee (optional)"><input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inpCls} /></Field>
        <Field label="Invoice / bill number (optional)"><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={inpCls} /></Field>
        <Field label="Description / purpose" wide><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inpCls} /></Field>
      </Section>

      <Section title="Payment details">
        <Field label="Payment mode"><select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as ExpensePaymentMode)} className={inpCls}>{EXPENSE_PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</option>)}</select></Field>
        <Field label="Amount (₹) *"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inpCls} /></Field>
        <Field label="GST included?">
          <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={gstIncluded} onChange={(e) => setGstIncluded(e.target.checked)} /> {gstIncluded ? "Amount already includes GST" : "GST added on top"}</label>
        </Field>
        <Field label="GST amount (₹, optional)"><input value={gst} onChange={(e) => setGst(e.target.value)} inputMode="decimal" className={inpCls} /></Field>
      </Section>

      <div className="ml-auto max-w-xs space-y-1 rounded-2xl border border-mint-soft bg-white p-4 text-sm">
        <Row k="Amount" v={inr(totals.amountPaise)} />
        <Row k={`GST ${gstIncluded ? "(incl.)" : "(added)"}`} v={inr(totals.gstPaise)} />
        <div className="mt-1 border-t border-mint-soft pt-1"><Row k="Total" v={inr(totals.totalPaise)} bold /></div>
      </div>

      <Section title="Approval workflow">
        <Field label="Requested by"><select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={inpCls}>{staffOptions(requestedBy)}</select></Field>
        <Field label="Approved by"><select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className={inpCls}>{staffOptions(approvedBy)}</select></Field>
        <Field label="Paid by"><select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inpCls}>{staffOptions(paidBy)}</select></Field>
      </Section>

      <Section title="Supporting documents">
        <div className="sm:col-span-2">
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${dragOver ? "border-leaf bg-mint-soft/40" : "border-mint-soft"}`}>
            <p className="text-ink-2">Drag &amp; drop invoices, receipts, bills, screenshots, PDFs or images here</p>
            <label className="mt-2 inline-block cursor-pointer rounded-full border border-mint-soft px-4 py-1.5 text-xs font-semibold text-forest hover:border-leaf">
              Browse files<input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-mint-soft bg-white px-3 py-2 text-xs">
                  <span>📄 {f.name} <span className="text-ink-3">· {f.kind} · {(f.sizeBytes / 1024).toFixed(0)} KB</span></span>
                  <button onClick={() => setFiles((s) => s.filter((_, idx) => idx !== i))} className="font-semibold text-red-600">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-ink-3">File metadata is saved with the expense; binary upload to storage (Supabase/Cloudinary) is wired at deploy.</p>
        </div>
      </Section>

      <Section title="Notes">
        <Field label="Internal remarks" wide><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inpCls} /></Field>
      </Section>

      <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Create expense"}</button>
    </div>
  );
}

/* ============================ Categories ============================ */

function CategoriesTab({ flash, categories, canManage, reload }: { flash: (m: string) => void; categories: CategoryRow[]; canManage: boolean; reload: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await api("/api/expenses/categories", { method: "POST", body: JSON.stringify({ name }) }); flash("Category added"); setName(""); reload(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function toggle(c: CategoryRow) {
    try { await api(`/api/expenses/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) }); flash(c.active ? "Disabled" : "Enabled"); reload(); }
    catch (e) { flash((e as Error).message); }
  }
  async function rename(c: CategoryRow) {
    const next = prompt("Rename category", c.name); if (!next || next === c.name) return;
    try { await api(`/api/expenses/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ name: next }) }); flash("Renamed"); reload(); }
    catch (e) { flash((e as Error).message); }
  }
  async function remove(c: CategoryRow) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api(`/api/expenses/categories/${c.id}`, { method: "DELETE" }); flash("Deleted"); reload(); }
    catch (e) { flash((e as Error).message); }
  }

  if (!canManage) return <p className="text-sm text-ink-3">Only an Admin or Super Admin can manage categories. Current categories: {categories.filter((c) => c.active).map((c) => c.name).join(", ")}.</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category name" className="flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
        <button disabled={busy || !name.trim()} onClick={add} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
      </div>
      <div className="divide-y divide-mint-soft rounded-2xl border border-mint-soft bg-white">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className={c.active ? "text-forest" : "text-ink-3 line-through"}>{c.name}</span>
            <div className="flex gap-2 text-xs font-semibold">
              <button onClick={() => rename(c)} className="text-leaf-600 underline">Rename</button>
              <button onClick={() => toggle(c)} className="text-ink-2 underline">{c.active ? "Disable" : "Enable"}</button>
              <button onClick={() => remove(c)} className="text-red-600 underline">Delete</button>
            </div>
          </div>
        ))}
        {!categories.length && <p className="px-4 py-6 text-center text-ink-3">No categories yet.</p>}
      </div>
    </div>
  );
}

/* ============================ Reports ============================ */

function ReportsTab({ flash, categories }: { flash: (m: string) => void; categories: CategoryRow[] }) {
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [categoryId, setCategoryId] = useState("");
  const [data, setData] = useState<ReportsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (preset) sp.set("preset", preset);
      if (categoryId) sp.set("categoryId", categoryId);
      setData(await api(`/api/expenses/reports?${sp}`));
    } catch (e) { flash((e as Error).message); }
  }, [preset, categoryId, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!data) return;
    const lines: (string | number)[][] = [
      ["DOODLY Expense Report"], ["Period", preset], [],
      ["Total entries", data.totals.count], ["Total (₹)", (data.totals.totalPaise / 100).toFixed(2)],
      ["Paid (₹)", (data.totals.paidPaise / 100).toFixed(2)], ["Outstanding (₹)", (data.totals.outstandingPaise / 100).toFixed(2)], ["GST (₹)", (data.totals.gstPaise / 100).toFixed(2)], [],
      ["By category"], ["Category", "Count", "Total (₹)"], ...data.byCategory.map((c) => [c.name, c.count, (c.totalPaise / 100).toFixed(2)]), [],
      ["By vendor"], ["Vendor", "Count", "Total (₹)"], ...data.byVendor.map((v) => [v.vendor, v.count, (v.totalPaise / 100).toFixed(2)]), [],
      ["By payment mode"], ["Mode", "Count", "Total (₹)"], ...data.byPaymentMode.map((m) => [PAYMENT_MODE_LABEL[m.mode as ExpensePaymentMode] ?? m.mode, m.count, (m.totalPaise / 100).toFixed(2)]), [],
      ["Outstanding payments"], ["Expense", "Vendor", "Total (₹)", "Outstanding (₹)"], ...data.outstanding.map((o) => [`${o.code} ${o.title}`, o.vendor ?? "", (o.totalPaise / 100).toFixed(2), (o.outstandingPaise / 100).toFixed(2)]),
    ];
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `expense-report-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.filter((p) => p.key !== "all").map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${preset === p.key ? "bg-leaf text-white" : "border border-mint-soft text-forest hover:border-leaf"}`}>{p.label}</button>
        ))}
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selCls}><option value="">All categories</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button onClick={exportCsv} disabled={!data} className="ml-auto rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Entries" value={String(data.totals.count)} />
            <Kpi label="Total" value={inrShort(data.totals.totalPaise)} />
            <Kpi label="Paid" value={inrShort(data.totals.paidPaise)} />
            <Kpi label="Outstanding" value={inrShort(data.totals.outstandingPaise)} />
            <Kpi label="GST" value={inrShort(data.totals.gstPaise)} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ReportTable title="By category" head={["Category", "Count", "Total"]} rows={data.byCategory.map((c) => [c.name, String(c.count), inr(c.totalPaise)])} />
            <ReportTable title="By vendor" head={["Vendor", "Count", "Total"]} rows={data.byVendor.map((v) => [v.vendor, String(v.count), inr(v.totalPaise)])} />
            <ReportTable title="By payment mode" head={["Mode", "Count", "Total"]} rows={data.byPaymentMode.map((m) => [PAYMENT_MODE_LABEL[m.mode as ExpensePaymentMode] ?? m.mode, String(m.count), inr(m.totalPaise)])} />
            <ReportTable title="Outstanding payments" head={["Expense", "Vendor", "Outstanding"]} rows={data.outstanding.map((o) => [`${o.code} · ${o.title}`, o.vendor ?? "—", inr(o.outstandingPaise)])} />
          </div>
          <p className="text-xs text-ink-3">GST report: {data.gst.count} GST-bearing expense(s), GST {inr(data.gst.gstPaise)} on {inr(data.gst.totalPaise)} total.</p>
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

const inpCls = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm";
const selCls = "rounded-lg border border-mint-soft px-2 py-1.5 text-sm";

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
function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-mint-soft bg-white px-3 py-2"><p className="font-display text-xl font-bold text-forest">{value}</p><p className="text-xs text-ink-3">{label}</p></div>;
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-forest" : "text-ink-2"}`}><span>{k}</span><span>{v}</span></div>;
}
