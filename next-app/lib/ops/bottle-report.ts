/* =============================================================
   DOODLY — Bottle Return report. Per-customer bottle accountability
   (delivered / returned / pending / overdue / lost / deposit held) plus an
   executive collection-performance section. Normalised {columns, rows, totalRow}
   so it renders through the shared milk-report PDF/CSV/XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { outstandingCustomers } from "@/lib/bottles/balance";

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

/** Per-customer outstanding + lifetime issued/returned/lost + deposit held. */
export async function bottleReport(): Promise<BottleReport> {
  const [holders, byUserEvent, deposits] = await Promise.all([
    outstandingCustomers(),
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

  return {
    type: "bottles",
    title: "Bottle Return Report",
    subtitle: `${holders.length} customer(s) holding ${totals.pending} bottle(s) · ${totals.overdueCustomers} overdue · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: rows.length,
    columns: [
      { label: "Customer" }, { label: "Mobile" }, { label: "Delivered", right: true }, { label: "Returned", right: true }, { label: "Lost", right: true },
      { label: "Pending", right: true }, { label: "Overdue" }, { label: "Subscription" }, { label: "Deposit held", right: true },
    ],
    rows,
    totalRow: ["TOTAL", `${holders.length} holder(s)`, String(totals.delivered), String(totals.returned), String(totals.lost), String(totals.pending), `${totals.overdueCustomers} overdue`, "", ""],
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
