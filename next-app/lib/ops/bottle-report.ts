/* =============================================================
   DOODLY — Bottle Return report. Per-customer bottle accountability
   (delivered / returned / pending / overdue / lost / deposit held) plus an
   executive collection-performance section. Normalised {columns, rows, totalRow}
   so it renders through the shared milk-report PDF/CSV/XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { outstandingCustomers, allBottleCustomers } from "@/lib/bottles/balance";

const rup = (p: number) => "Rs." + (Math.round(p) / 100).toLocaleString("en-IN");

export interface BottleReport {
  type: string;
  title: string;
  subtitle: string;
  rowCount: number;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  data: unknown;
  totals: { delivered: number; returned: number; lost: number; pending: number; overdueCustomers: number };
}

/** Per-customer outstanding + lifetime issued/returned/lost + deposit held.
    `scope: "all"` includes settled customers (held 0); default lists only current holders. */
export async function bottleReport(scope: "outstanding" | "all" = "outstanding"): Promise<BottleReport> {
  const [holders, byUserEvent, deposits] = await Promise.all([
    scope === "all" ? allBottleCustomers() : outstandingCustomers(),
    db.bottleLedger.groupBy({ by: ["userId", "event"], _sum: { qty: true } }),
    db.order.groupBy({ by: ["userId"], where: { status: "PAID" }, _sum: { depositPaise: true } }),
  ]);

  const issuedOf = new Map<string, number>(), returnedOf = new Map<string, number>(), lostOf = new Map<string, number>(), refundOf = new Map<string, number>();
  for (const g of byUserEvent) {
    const q = g._sum.qty ?? 0;
    if (g.event === "ISSUED") issuedOf.set(g.userId, q);
    else if (g.event === "RETURNED") returnedOf.set(g.userId, q);
    else if (g.event === "LOST") lostOf.set(g.userId, q);
  }
  const depOf = new Map<string, number>(deposits.map((d) => [d.userId, d._sum.depositPaise ?? 0]));
  const refundAgg = await db.bottleLedger.groupBy({ by: ["userId"], where: { event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true } });
  for (const r of refundAgg) refundOf.set(r.userId, r._sum.amountPaise ?? 0);

  const rows = holders.map((c) => {
    const issued = issuedOf.get(c.userId) ?? 0, returned = returnedOf.get(c.userId) ?? 0, lost = lostOf.get(c.userId) ?? 0;
    const depositHeld = Math.max(0, (depOf.get(c.userId) ?? 0) - (refundOf.get(c.userId) ?? 0));
    return [
      c.name, c.phone ?? "—", String(issued), String(returned), String(lost),
      String(c.held), c.overdueDays > 0 ? `${c.overdueDays}d` : "—", c.subStatus ?? "—", rup(depositHeld),
    ];
  });

  const totals = {
    delivered: [...issuedOf.values()].reduce((a, b) => a + b, 0),
    returned: [...returnedOf.values()].reduce((a, b) => a + b, 0),
    lost: [...lostOf.values()].reduce((a, b) => a + b, 0),
    pending: holders.reduce((a, c) => a + c.held, 0),
    overdueCustomers: holders.filter((c) => c.overdueDays >= 2).length,
  };

  const settled = holders.filter((c) => c.held === 0).length;
  const subtitle = scope === "all"
    ? `${holders.length} customer(s) · ${settled} settled · ${totals.pending} bottle(s) outstanding · ${totals.overdueCustomers} overdue · generated ${new Date().toLocaleString("en-IN")}`
    : `${holders.length} customer(s) holding ${totals.pending} bottle(s) · ${totals.overdueCustomers} overdue · generated ${new Date().toLocaleString("en-IN")}`;

  return {
    type: "bottles",
    title: scope === "all" ? "Bottle Report — all customers" : "Bottle Return Report",
    subtitle,
    rowCount: rows.length,
    columns: [
      { label: "Customer" }, { label: "Mobile" }, { label: "Delivered", right: true }, { label: "Returned", right: true }, { label: "Lost", right: true },
      { label: "Pending", right: true }, { label: "Overdue" }, { label: "Subscription" }, { label: "Deposit held", right: true },
    ],
    rows,
    totalRow: ["TOTAL", `${holders.length} customer(s)`, String(totals.delivered), String(totals.returned), String(totals.lost), String(totals.pending), `${totals.overdueCustomers} overdue`, "", ""],
    data: holders,
    totals,
  };
}

/** Executive collection performance — bottles collected (RETURNED via delivery) per exec. */
export async function bottleExecReport(): Promise<BottleReport> {
  const grp = await db.delivery.groupBy({ by: ["driverId"], where: { status: "DELIVERED", driverId: { not: null } }, _sum: { bottlesIn: true, bottlesOut: true }, _count: { _all: true } });
  const drivers = await db.driver.findMany({ where: { id: { in: grp.map((g) => g.driverId!).filter(Boolean) } }, select: { id: true, employeeId: true, user: { select: { name: true } } } });
  const nameOf = new Map(drivers.map((d) => [d.id, d]));
  const data = grp.map((g) => {
    const d = nameOf.get(g.driverId!);
    const out = g._sum.bottlesOut ?? 0, inn = g._sum.bottlesIn ?? 0;
    return { name: d?.user?.name ?? "—", empId: d?.employeeId ?? "—", delivered: g._count._all, out, in: inn, rate: out ? Math.round((inn / out) * 1000) / 10 : 0 };
  }).sort((a, b) => b.in - a.in);
  const rows = data.map((r) => [r.name, r.empId, String(r.delivered), String(r.out), String(r.in), `${r.rate}%`]);
  return {
    type: "bottleExec",
    title: "Executive Bottle-Collection Performance",
    subtitle: `${data.length} executive(s) · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: rows.length,
    columns: [{ label: "Executive" }, { label: "Emp ID" }, { label: "Deliveries", right: true }, { label: "Bottles out", right: true }, { label: "Bottles in", right: true }, { label: "Return rate", right: true }],
    rows,
    totalRow: ["TOTAL", `${data.length} exec(s)`, String(data.reduce((s, r) => s + r.delivered, 0)), String(data.reduce((s, r) => s + r.out, 0)), String(data.reduce((s, r) => s + r.in, 0)), ""],
    data, totals: { delivered: 0, returned: 0, lost: 0, pending: 0, overdueCustomers: 0 },
  };
}

/** Per-customer bottle-deposit accountability: collected / refunded / held / outstanding bottles. */
export async function depositReport(): Promise<BottleReport> {
  const [charged, refunded, holders] = await Promise.all([
    db.order.groupBy({ by: ["userId"], where: { status: "PAID", depositPaise: { gt: 0 } }, _sum: { depositPaise: true } }),
    db.bottleLedger.groupBy({ by: ["userId"], where: { event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true } }),
    allBottleCustomers(),
  ]);
  const paidOf = new Map(charged.map((c) => [c.userId, c._sum.depositPaise ?? 0]));
  const refOf = new Map(refunded.map((r) => [r.userId, r._sum.amountPaise ?? 0]));
  const heldOf = new Map(holders.map((h) => [h.userId, { held: h.held, name: h.name, phone: h.phone }]));
  const ids = [...new Set([...paidOf.keys(), ...heldOf.keys()])];
  const missing = ids.filter((id) => !heldOf.has(id));
  const names = missing.length ? await db.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, phone: true } }) : [];
  const nameOf = new Map(names.map((u) => [u.id, u]));

  const rows = ids.map((id) => {
    const h = heldOf.get(id); const u = nameOf.get(id);
    const paid = paidOf.get(id) ?? 0, ref = refOf.get(id) ?? 0, held = Math.max(0, paid - ref);
    return { name: h?.name ?? u?.name ?? "Customer", phone: h?.phone ?? u?.phone ?? "—", paid, ref, held, bottles: h?.held ?? 0 };
  }).filter((r) => r.paid > 0 || r.ref > 0 || r.bottles > 0).sort((a, b) => b.held - a.held);

  const T = { paid: rows.reduce((s, r) => s + r.paid, 0), ref: rows.reduce((s, r) => s + r.ref, 0), held: rows.reduce((s, r) => s + r.held, 0), bottles: rows.reduce((s, r) => s + r.bottles, 0) };
  return {
    type: "deposits", title: "Bottle Deposit Report",
    subtitle: `${rows.length} customer(s) · ${rup(T.held)} held · ${rup(T.ref)} refunded · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: rows.length,
    columns: [{ label: "Customer" }, { label: "Mobile" }, { label: "Deposit paid", right: true }, { label: "Refunded", right: true }, { label: "Held (pending)", right: true }, { label: "Outstanding bottles", right: true }],
    rows: rows.map((r) => [r.name, r.phone, rup(r.paid), rup(r.ref), rup(r.held), String(r.bottles)]),
    totalRow: ["TOTAL", `${rows.length} customer(s)`, rup(T.paid), rup(T.ref), rup(T.held), String(T.bottles)],
    data: rows, totals: { delivered: 0, returned: 0, lost: 0, pending: T.bottles, overdueCustomers: 0 },
  };
}

/** Bottle-return pickup requests: status, bottles, refundable + refunded deposit. */
export async function pickupReport(): Promise<BottleReport> {
  const reqs = await db.bottlePickupRequest.findMany({
    orderBy: { requestedAt: "desc" }, take: 2000,
    select: { status: true, bottlesExpected: true, bottlesCollected: true, refundableDepositPaise: true, refundedPaise: true, requestedAt: true, user: { select: { name: true, phone: true } }, driver: { select: { employeeId: true, user: { select: { name: true } } } } },
  });
  const rows = reqs.map((r) => [
    r.user?.name ?? "Customer", r.user?.phone ?? "—", r.status,
    String(r.bottlesExpected), String(r.bottlesCollected), rup(r.refundableDepositPaise), rup(r.refundedPaise),
    r.driver ? (r.driver.user?.name ?? r.driver.employeeId ?? "—") : "—", r.requestedAt.toLocaleDateString("en-IN"),
  ]);
  const T = { expected: reqs.reduce((s, r) => s + r.bottlesExpected, 0), collected: reqs.reduce((s, r) => s + r.bottlesCollected, 0), refunded: reqs.reduce((s, r) => s + r.refundedPaise, 0) };
  return {
    type: "pickups", title: "Bottle Pickup Requests Report",
    subtitle: `${reqs.length} request(s) · ${T.collected}/${T.expected} bottles collected · ${rup(T.refunded)} refunded · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: reqs.length,
    columns: [{ label: "Customer" }, { label: "Mobile" }, { label: "Status" }, { label: "Expected", right: true }, { label: "Collected", right: true }, { label: "Refundable", right: true }, { label: "Refunded", right: true }, { label: "Executive" }, { label: "Requested" }],
    rows,
    totalRow: ["TOTAL", `${reqs.length} request(s)`, "", String(T.expected), String(T.collected), "", rup(T.refunded), "", ""],
    data: reqs, totals: { delivered: 0, returned: T.collected, lost: 0, pending: 0, overdueCustomers: 0 },
  };
}

/** Bottle-ownership summary: per-customer owned / returned / deposit paid / refunded / held / status.
    Drives the smart-deposit eligibility view (who still holds bottles = who isn't re-charged). */
export async function ownershipReport(): Promise<BottleReport> {
  const [holders, byUserEvent, charged, refunded] = await Promise.all([
    allBottleCustomers(),
    db.bottleLedger.groupBy({ by: ["userId", "event"], _sum: { qty: true } }),
    db.order.groupBy({ by: ["userId"], where: { status: "PAID", depositPaise: { gt: 0 } }, _sum: { depositPaise: true } }),
    db.bottleLedger.groupBy({ by: ["userId"], where: { event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true } }),
  ]);
  const issuedOf = new Map<string, number>(), returnedOf = new Map<string, number>();
  for (const g of byUserEvent) { const q = g._sum.qty ?? 0; if (g.event === "ISSUED") issuedOf.set(g.userId, q); else if (g.event === "RETURNED") returnedOf.set(g.userId, q); }
  const paidOf = new Map(charged.map((c) => [c.userId, c._sum.depositPaise ?? 0]));
  const refOf = new Map(refunded.map((r) => [r.userId, r._sum.amountPaise ?? 0]));

  const data = holders.map((c) => {
    const owned = c.held, issued = issuedOf.get(c.userId) ?? 0, returned = returnedOf.get(c.userId) ?? 0;
    const paid = paidOf.get(c.userId) ?? 0, ref = refOf.get(c.userId) ?? 0, held = Math.max(0, paid - ref);
    const status = owned > 0 ? "Owns bottles" : issued > 0 ? "Returned all" : "New";
    return { name: c.name, phone: c.phone ?? "—", owned, returned, paid, ref, held, status };
  }).sort((a, b) => b.owned - a.owned || a.name.localeCompare(b.name));

  const T = { owned: data.reduce((s, r) => s + r.owned, 0), returned: data.reduce((s, r) => s + r.returned, 0), paid: data.reduce((s, r) => s + r.paid, 0), ref: data.reduce((s, r) => s + r.ref, 0), held: data.reduce((s, r) => s + r.held, 0) };
  const withBottles = data.filter((r) => r.owned > 0).length;
  return {
    type: "ownership", title: "Bottle Ownership Report",
    subtitle: `${data.length} customer(s) · ${withBottles} still hold bottles · ${T.owned} bottle(s) out · ${rup(T.held)} deposit held · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: data.length,
    columns: [{ label: "Customer" }, { label: "Mobile" }, { label: "Owned", right: true }, { label: "Returned", right: true }, { label: "Deposit paid", right: true }, { label: "Refunded", right: true }, { label: "Held", right: true }, { label: "Status" }],
    rows: data.map((r) => [r.name, r.phone, String(r.owned), String(r.returned), rup(r.paid), rup(r.ref), rup(r.held), r.status]),
    totalRow: ["TOTAL", `${data.length} customer(s)`, String(T.owned), String(T.returned), rup(T.paid), rup(T.ref), rup(T.held), `${withBottles} with bottles`],
    data, totals: { delivered: 0, returned: T.returned, lost: 0, pending: T.owned, overdueCustomers: 0 },
  };
}

// ---------- exports (CSV/XLS mirror route-report) ----------
export function bottleReportFilename(kind: string, ext: string) { return `DOODLY_Bottle_${kind}_${new Date().toISOString().slice(0, 10)}.${ext}`; }

export function reportCsv(r: BottleReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  return [r.columns.map((c) => c.label), ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}
export function reportXls(r: BottleReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"};mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body><h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p><table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
