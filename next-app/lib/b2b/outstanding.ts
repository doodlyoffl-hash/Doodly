/* =============================================================
   Business Invoice — Outstanding Ledger engine (server-only).

   THE fix: outstanding is derived from the PAYMENT LEDGER (BusinessPayment), never from the
   denormalised order.paidPaise. That lets us answer the finance questions the old code could not:

     • Outstanding AS OF any date D  = Σ(invoice totals issued ≤ D, non-void) − Σ(payments dated ≤ D)
     • Paid DURING a period [from,to] = Σ(payments whose effective date is in the period)
     • First / last payment date, the date outstanding was cleared, days outstanding, aging.

   Outstanding is ALWAYS computed (total − Σ payments), so historical/old balances never disappear
   when a date filter is applied. A payment's effective date is `paidAt ?? createdAt` (finance may
   record a payment on a date after it was actually made). Money is integer paise throughout; this
   never re-computes revenue (that stays delivery-based) — it only tracks accounts-receivable.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { MilkReport } from "@/lib/milk/reports";

const DAY = 86400000;
const startOf = (iso?: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00.000`) : null);
const endOf = (iso?: string | null): Date | null => (iso ? new Date(`${iso}T23:59:59.999`) : null);
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY));

export type OutstandingBasis = "issued" | "delivery" | "payment" | "cleared" | "created";
export interface OutstandingFilters {
  asOf?: string;                 // reconcile date (YYYY-MM-DD); default = today. Outstanding is "as of" end-of-this-day.
  from?: string; to?: string;    // period for basis narrowing + "paid during period"
  basis?: OutstandingBasis;      // which date the [from,to] window applies to
  businessId?: string;
  q?: string;
  outstandingOnly?: boolean;     // true (default) → only rows still owing at asOf; false → full history
  status?: "outstanding" | "cleared" | "overdue" | "";
  amountFromPaise?: number; amountToPaise?: number;       // invoice total range
  outFromPaise?: number; outToPaise?: number;             // outstanding-as-of range
  gstOnly?: boolean;             // only GST invoices (gstPaise > 0)
}

export interface LedgerRow {
  invoiceId: string; number: string; orderId: string; orderCode: string;
  businessId: string; businessCode: string; businessName: string; gst: string | null;
  issuedAt: string; dueDate: string | null; deliveredAt: string | null;
  invoiceTotalPaise: number;
  paidAllTimePaise: number;      // Σ every payment
  paidAsOfPaise: number;         // Σ payments ≤ asOf
  paidInPeriodPaise: number;     // Σ payments in [from,to]
  outstandingAsOfPaise: number;  // total − paidAsOf
  firstPaymentAt: string | null; lastPaymentAt: string | null;
  outstandingSince: string | null;   // when the balance arose (issue date) — null once cleared at asOf
  clearedAt: string | null;          // date cumulative payments first covered the total (live-computed)
  daysOutstanding: number;           // as of asOf, since outstandingSince
  statusAsOf: "PAID" | "PARTIAL" | "UNPAID";
  overdue: boolean;
  itemsSummary: string;
}

type InvWith = Prisma.BusinessInvoiceGetPayload<{ select: {
  id: true; number: true; issuedAt: true; dueDate: true; gstPaise: true; businessId: true;
  order: { select: { id: true; code: true; totalPaise: true; deliveredAt: true; business: { select: { code: true; name: true; gst: true } }; items: { select: { productName: true; quantity: true; unit: true } } } };
} }>;

/** Parse OutstandingFilters from a URL query — shared by the ledger API and the export route. */
export function parseOutstandingFilters(sp: URLSearchParams): OutstandingFilters {
  const p = (k: string) => (sp.get(k) ? Math.round(Number(sp.get(k)) * 100) : undefined);
  return {
    asOf: sp.get("asOf") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined,
    basis: (sp.get("basis") as OutstandingBasis) ?? undefined,
    businessId: sp.get("businessId") ?? undefined, q: sp.get("q") ?? undefined,
    status: (sp.get("status") as OutstandingFilters["status"]) ?? undefined,
    outstandingOnly: sp.get("all") === "1" ? false : undefined,
    amountFromPaise: p("amountFrom"), amountToPaise: p("amountTo"), outFromPaise: p("outFrom"), outToPaise: p("outTo"),
    gstOnly: sp.get("gstOnly") === "1",
  };
}

function invoiceWhere(f: OutstandingFilters, asOfEnd: Date): Prisma.BusinessInvoiceWhereInput {
  const where: Prisma.BusinessInvoiceWhereInput = { status: { not: "VOID" }, issuedAt: { lte: asOfEnd } };
  if (f.businessId) where.businessId = f.businessId;
  if (f.gstOnly) where.gstPaise = { gt: 0 };
  if (f.q?.trim()) {
    const s = f.q.trim();
    where.OR = [
      { number: { contains: s, mode: "insensitive" } },
      { order: { code: { contains: s, mode: "insensitive" } } },
      { order: { business: { code: { contains: s, mode: "insensitive" } } } },
      { order: { business: { name: { contains: s, mode: "insensitive" } } } },
      { order: { business: { gst: { contains: s, mode: "insensitive" } } } },
      { order: { business: { mobile: { contains: s } } } },
    ];
  }
  return where;
}

/** Load the candidate invoices (issued ≤ asOf, non-void, + business/q/gst filters) and compute
    every per-invoice ledger metric from the payment ledger. The date-basis window + amount ranges
    + outstanding-only are applied in JS (they need the computed values). Returns rows + the asOf. */
export async function computeLedger(f: OutstandingFilters = {}): Promise<{ rows: LedgerRow[]; asOf: Date }> {
  const asOfEnd = endOf(f.asOf) ?? new Date();
  const fromStart = startOf(f.from), toEnd = endOf(f.to);
  const invoices = (await db.businessInvoice.findMany({
    where: invoiceWhere(f, asOfEnd),
    select: { id: true, number: true, issuedAt: true, dueDate: true, gstPaise: true, businessId: true, order: { select: { id: true, code: true, totalPaise: true, deliveredAt: true, business: { select: { code: true, name: true, gst: true } }, items: { select: { productName: true, quantity: true, unit: true } } } } },
    orderBy: { issuedAt: "asc" }, take: 5000,
  })) as InvWith[];

  const orderIds = invoices.map((i) => i.order.id);
  const payments = orderIds.length
    ? await db.businessPayment.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, amountPaise: true, paidAt: true, createdAt: true } })
    : [];
  const byOrder = new Map<string, { eff: Date; amountPaise: number }[]>();
  for (const p of payments) {
    if (!p.orderId) continue;   // unlinked payment — not attributable to an invoice's order
    const eff = p.paidAt ?? p.createdAt;
    (byOrder.get(p.orderId) ?? byOrder.set(p.orderId, []).get(p.orderId)!).push({ eff, amountPaise: p.amountPaise });
  }
  for (const arr of byOrder.values()) arr.sort((a, b) => a.eff.getTime() - b.eff.getTime());

  const rows: LedgerRow[] = [];
  for (const inv of invoices) {
    const total = inv.order.totalPaise;
    const pays = byOrder.get(inv.order.id) ?? [];
    let paidAll = 0, paidAsOf = 0, paidInPeriod = 0, cum = 0, clearedAt: Date | null = null;
    let firstAt: Date | null = null, lastAt: Date | null = null;
    for (const p of pays) {
      paidAll += p.amountPaise;
      if (p.eff <= asOfEnd) paidAsOf += p.amountPaise;
      if (fromStart && toEnd && p.eff >= fromStart && p.eff <= toEnd) paidInPeriod += p.amountPaise;
      cum += p.amountPaise;
      if (clearedAt === null && cum >= total) clearedAt = p.eff;   // first payment that covered the total
      if (firstAt === null) firstAt = p.eff;
      lastAt = p.eff;
    }
    const outstandingAsOf = Math.max(0, total - paidAsOf);
    const stillOwing = outstandingAsOf > 0;
    const outstandingSince = stillOwing ? inv.issuedAt : null;
    const statusAsOf: LedgerRow["statusAsOf"] = paidAsOf >= total ? "PAID" : paidAsOf > 0 ? "PARTIAL" : "UNPAID";
    const overdue = stillOwing && !!inv.dueDate && inv.dueDate < asOfEnd;
    rows.push({
      invoiceId: inv.id, number: inv.number, orderId: inv.order.id, orderCode: inv.order.code,
      businessId: inv.businessId, businessCode: inv.order.business.code, businessName: inv.order.business.name, gst: inv.order.business.gst,
      issuedAt: inv.issuedAt.toISOString(), dueDate: inv.dueDate?.toISOString() ?? null, deliveredAt: inv.order.deliveredAt?.toISOString() ?? null,
      invoiceTotalPaise: total, paidAllTimePaise: paidAll, paidAsOfPaise: paidAsOf, paidInPeriodPaise: paidInPeriod, outstandingAsOfPaise: outstandingAsOf,
      firstPaymentAt: firstAt?.toISOString() ?? null, lastPaymentAt: lastAt?.toISOString() ?? null,
      outstandingSince: outstandingSince?.toISOString() ?? null,
      clearedAt: clearedAt && clearedAt <= asOfEnd ? clearedAt.toISOString() : null,
      daysOutstanding: stillOwing ? daysBetween(inv.issuedAt, asOfEnd) : 0,
      statusAsOf, overdue,
      itemsSummary: inv.order.items.map((it) => `${it.quantity} ${it.unit} ${it.productName}`).slice(0, 3).join(", "),
    });
  }

  // date-basis window (narrows the LIST; "as-of" outstanding is already computed above)
  const inWin = (d: string | null) => { if (!fromStart || !toEnd || !d) return !d ? false : true; const t = new Date(d); return t >= fromStart && t <= toEnd; };
  let out = rows;
  if (fromStart && toEnd) {
    const basis = f.basis ?? "issued";
    out = rows.filter((r) => {
      if (basis === "issued" || basis === "created") return inWin(r.issuedAt);
      if (basis === "delivery") return inWin(r.deliveredAt);
      if (basis === "payment") return r.paidInPeriodPaise > 0;   // received a payment in the period
      if (basis === "cleared") return inWin(r.clearedAt);
      return true;
    });
  }
  if (f.amountFromPaise != null) out = out.filter((r) => r.invoiceTotalPaise >= f.amountFromPaise!);
  if (f.amountToPaise != null) out = out.filter((r) => r.invoiceTotalPaise <= f.amountToPaise!);
  if (f.outFromPaise != null) out = out.filter((r) => r.outstandingAsOfPaise >= f.outFromPaise!);
  if (f.outToPaise != null) out = out.filter((r) => r.outstandingAsOfPaise <= f.outToPaise!);
  if (f.status === "overdue") out = out.filter((r) => r.overdue);
  else if (f.status === "cleared") out = out.filter((r) => r.outstandingAsOfPaise <= 0);
  else if (f.status === "outstanding" || f.outstandingOnly !== false) out = out.filter((r) => r.outstandingAsOfPaise > 0);
  // default (outstandingOnly unset) → outstanding only; pass outstandingOnly:false for full history

  out.sort((a, b) => b.daysOutstanding - a.daysOutstanding || b.outstandingAsOfPaise - a.outstandingAsOfPaise);
  return { rows: out, asOf: asOfEnd };
}

const AGE_BUCKETS: [string, number, number][] = [["0-7", 0, 7], ["8-15", 8, 15], ["16-30", 16, 30], ["31-60", 31, 60], ["61-90", 61, 90], ["90+", 91, Infinity]];
export function agingBuckets(rows: LedgerRow[]) {
  return AGE_BUCKETS.map(([label, lo, hi]) => {
    const inBucket = rows.filter((r) => r.outstandingAsOfPaise > 0 && r.daysOutstanding >= lo && r.daysOutstanding <= hi);
    return { label, count: inBucket.length, amountPaise: inBucket.reduce((s, r) => s + r.outstandingAsOfPaise, 0) };
  });
}

/** Dashboard/summary over the SAME filtered set (Step 11) — every figure ties to the ledger. */
export async function outstandingSummary(f: OutstandingFilters = {}) {
  // Summary must count ALL invoices in scope (not just still-owing), so compute over the full set.
  const { rows, asOf } = await computeLedger({ ...f, outstandingOnly: false, status: "" });
  const sum = (fn: (r: LedgerRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
  const cleared = rows.filter((r) => r.clearedAt);
  const avgCollectionDays = cleared.length ? Math.round(cleared.reduce((s, r) => s + daysBetween(new Date(r.issuedAt), new Date(r.clearedAt!)), 0) / cleared.length) : 0;
  const hasPeriod = !!(f.from && f.to);
  return {
    asOf: asOf.toISOString(),
    invoiceCount: rows.length,
    invoiceTotalPaise: sum((r) => r.invoiceTotalPaise),
    collectedAllTimePaise: sum((r) => r.paidAllTimePaise),
    collectedAsOfPaise: sum((r) => r.paidAsOfPaise),
    paidInPeriodPaise: hasPeriod ? sum((r) => r.paidInPeriodPaise) : null,
    outstandingAsOfPaise: sum((r) => r.outstandingAsOfPaise),
    overdueAmountPaise: sum((r) => (r.overdue ? r.outstandingAsOfPaise : 0)),
    fullyPaid: rows.filter((r) => r.statusAsOf === "PAID").length,
    partiallyPaid: rows.filter((r) => r.statusAsOf === "PARTIAL").length,
    unpaid: rows.filter((r) => r.statusAsOf === "UNPAID").length,
    avgCollectionDays,
    aging: agingBuckets(rows),
  };
}

/** Per-business ledger (Step 8) — chronological invoice + payment events with a running balance. */
export async function businessLedger(businessId: string, f: OutstandingFilters = {}) {
  const asOfEnd = endOf(f.asOf) ?? new Date();
  const [biz, invoices, payments] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { code: true, name: true, gst: true, mobile: true, creditLimitPaise: true } }),
    db.businessInvoice.findMany({ where: { businessId, status: { not: "VOID" }, issuedAt: { lte: asOfEnd } }, select: { id: true, number: true, issuedAt: true, order: { select: { code: true, totalPaise: true } } } }),
    db.businessPayment.findMany({ where: { businessId }, select: { id: true, amountPaise: true, method: true, reference: true, paidAt: true, createdAt: true, order: { select: { code: true, invoice: { select: { number: true } } } } } }),
  ]);
  type Ev = { at: Date; kind: "INVOICE" | "PAYMENT"; ref: string; label: string; debitPaise: number; creditPaise: number; method?: string };
  const events: Ev[] = [];
  for (const inv of invoices) events.push({ at: inv.issuedAt, kind: "INVOICE", ref: inv.number, label: `Invoice ${inv.number} (${inv.order.code})`, debitPaise: inv.order.totalPaise, creditPaise: 0 });
  for (const p of payments) { const eff = p.paidAt ?? p.createdAt; if (eff > asOfEnd) continue; events.push({ at: eff, kind: "PAYMENT", ref: p.order?.invoice?.number ?? p.order?.code ?? "—", label: `Payment${p.reference ? " " + p.reference : ""}`, debitPaise: 0, creditPaise: p.amountPaise, method: p.method }); }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  let bal = 0;
  const lines = events.map((e) => { bal += e.debitPaise - e.creditPaise; return { date: e.at.toISOString(), kind: e.kind, ref: e.ref, label: e.label, debitPaise: e.debitPaise, creditPaise: e.creditPaise, method: e.method ?? null, balancePaise: bal }; });
  return { business: biz ? { businessId, ...biz } : { businessId }, asOf: asOfEnd.toISOString(), lines, closingBalancePaise: bal };
}

/** Payment history (Step 2) — every payment, newest first, optionally within [from,to] on effective date. */
export async function paymentHistory(f: OutstandingFilters = {}) {
  const fromStart = startOf(f.from), toEnd = endOf(f.to);
  const where: Prisma.BusinessPaymentWhereInput = {};
  if (f.businessId) where.businessId = f.businessId;
  const rows = await db.businessPayment.findMany({
    where, select: { id: true, amountPaise: true, method: true, reference: true, note: true, paidAt: true, createdAt: true, business: { select: { code: true, name: true } }, order: { select: { code: true, invoice: { select: { number: true } } } } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 5000,
  });
  return rows
    .map((p) => ({ id: p.id, at: (p.paidAt ?? p.createdAt).toISOString(), amountPaise: p.amountPaise, method: p.method, reference: p.reference, note: p.note, businessCode: p.business.code, businessName: p.business.name, orderCode: p.order?.code ?? null, invoiceNumber: p.order?.invoice?.number ?? null }))
    .filter((p) => { if (!fromStart || !toEnd) return true; const t = new Date(p.at); return t >= fromStart && t <= toEnd; });
}

/** Collection report (Step 10) — payments received in [from,to] grouped by business. */
export async function collectionReport(f: OutstandingFilters = {}) {
  const hist = await paymentHistory(f);
  const byBiz = new Map<string, { code: string; name: string; count: number; collectedPaise: number }>();
  for (const p of hist) {
    const cur = byBiz.get(p.businessCode) ?? { code: p.businessCode, name: p.businessName, count: 0, collectedPaise: 0 };
    cur.count++; cur.collectedPaise += p.amountPaise; byBiz.set(p.businessCode, cur);
  }
  return { totalCollectedPaise: hist.reduce((s, p) => s + p.amountPaise, 0), paymentCount: hist.length, byBusiness: [...byBiz.values()].sort((a, b) => b.collectedPaise - a.collectedPaise) };
}

// ---------- MilkReport builders (drive PDF / Excel / CSV / Print exports, Step 10) ----------
const rupR = (p: number) => "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN");
const d10 = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const rtype = (t: string) => t as unknown as MilkReport["type"];

/** Outstanding Ledger report — as-of-date per-invoice balances (never hides old). */
export async function outstandingReport(f: OutstandingFilters = {}): Promise<MilkReport> {
  const { rows, asOf } = await computeLedger(f);
  const trows = rows.map((r) => [r.number, d10(r.issuedAt), r.businessName, rupR(r.invoiceTotalPaise), rupR(r.paidAsOfPaise), rupR(r.outstandingAsOfPaise), d10(r.outstandingSince), d10(r.lastPaymentAt), String(r.daysOutstanding), r.statusAsOf + (r.overdue ? " · OVERDUE" : "")]);
  const totTot = rows.reduce((s, r) => s + r.invoiceTotalPaise, 0), totPaid = rows.reduce((s, r) => s + r.paidAsOfPaise, 0), totOut = rows.reduce((s, r) => s + r.outstandingAsOfPaise, 0);
  return {
    type: rtype("b2bOutstanding"), title: "B2B Outstanding Ledger",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)} · ${rows.length} invoice(s) · billed ${rupR(totTot)} − paid ${rupR(totPaid)} = OUTSTANDING ${rupR(totOut)}`,
    rowCount: trows.length,
    columns: [{ label: "Invoice" }, { label: "Inv date" }, { label: "Business" }, { label: "Amount", right: true }, { label: "Paid", right: true }, { label: "Outstanding", right: true }, { label: "Since" }, { label: "Last pay" }, { label: "Days", right: true }, { label: "Status" }],
    rows: trows, totalRow: ["TOTAL", "", `${rows.length} inv`, rupR(totTot), rupR(totPaid), rupR(totOut), "", "", "", ""],
  };
}

/** Aging report — outstanding grouped into age buckets. */
export async function agingReport(f: OutstandingFilters = {}): Promise<MilkReport> {
  const { rows, asOf } = await computeLedger(f);
  const buckets = agingBuckets(rows);
  const trows = buckets.map((b) => [b.label + " days", String(b.count), rupR(b.amountPaise)]);
  const totC = buckets.reduce((s, b) => s + b.count, 0), totA = buckets.reduce((s, b) => s + b.amountPaise, 0);
  return {
    type: rtype("b2bAging"), title: "B2B Outstanding Aging", subtitle: `As of ${asOf.toISOString().slice(0, 10)} · total outstanding ${rupR(totA)} across ${totC} invoice(s)`,
    rowCount: trows.length, columns: [{ label: "Age bucket" }, { label: "Invoices", right: true }, { label: "Outstanding", right: true }],
    rows: trows, totalRow: ["TOTAL", String(totC), rupR(totA)],
  };
}

/** Collection report — payments received in the period grouped by business. */
export async function collectionReportTable(f: OutstandingFilters = {}): Promise<MilkReport> {
  const c = await collectionReport(f);
  const trows = c.byBusiness.map((b) => [b.name + (b.code ? ` (${b.code})` : ""), String(b.count), rupR(b.collectedPaise)]);
  return {
    type: rtype("b2bCollection"), title: "B2B Collection Report", subtitle: `${f.from || "…"} → ${f.to || "…"} · ${c.paymentCount} payment(s) · collected ${rupR(c.totalCollectedPaise)}`,
    rowCount: trows.length, columns: [{ label: "Business" }, { label: "Payments", right: true }, { label: "Collected", right: true }],
    rows: trows, totalRow: ["TOTAL", String(c.paymentCount), rupR(c.totalCollectedPaise)],
  };
}

/** Payment History report — every payment (optionally within the period). */
export async function paymentHistoryReport(f: OutstandingFilters = {}): Promise<MilkReport> {
  const rows = await paymentHistory(f);
  const trows = rows.map((p) => [d10(p.at), p.invoiceNumber || p.orderCode || "—", p.businessName, p.method, p.reference || "—", rupR(p.amountPaise)]);
  const tot = rows.reduce((s, p) => s + p.amountPaise, 0);
  return {
    type: rtype("b2bPayments"), title: "B2B Payment History", subtitle: `${rows.length} payment(s) · ${rupR(tot)}`,
    rowCount: trows.length, columns: [{ label: "Date" }, { label: "Invoice" }, { label: "Business" }, { label: "Method" }, { label: "Reference" }, { label: "Amount", right: true }],
    rows: trows, totalRow: ["TOTAL", "", "", "", "", rupR(tot)],
  };
}

/** Business Ledger report — one business's chronological statement with running balance. */
export async function businessLedgerReport(businessId: string, f: OutstandingFilters = {}): Promise<MilkReport> {
  const l = await businessLedger(businessId, f);
  const trows = l.lines.map((e) => [d10(e.date), e.kind, e.ref, e.label, e.debitPaise ? rupR(e.debitPaise) : "", e.creditPaise ? rupR(e.creditPaise) : "", rupR(e.balancePaise)]);
  const name = (l.business as { name?: string }).name || businessId;
  return {
    type: rtype("b2bBusinessLedger"), title: `B2B Business Ledger — ${name}`, subtitle: `Closing balance ${rupR(l.closingBalancePaise)} as of ${l.asOf.slice(0, 10)} · ${l.lines.length} entries`,
    rowCount: trows.length, columns: [{ label: "Date" }, { label: "Type" }, { label: "Ref" }, { label: "Particulars" }, { label: "Debit", right: true }, { label: "Credit", right: true }, { label: "Balance", right: true }],
    rows: trows, totalRow: ["", "", "", "Closing balance", "", "", rupR(l.closingBalancePaise)],
  };
}
