/* =============================================================
   DOODLY — Tanker Closing Report: freeze + view + export.
   OPEN tanker → LIVE reconciliation (lib/milk/reconcile). CLOSED tanker → the
   FROZEN immutable snapshot (TankerClosingReport); if a tanker closed before this
   feature existed it is frozen lazily on first view. Exports reuse the milk report
   renderers (CSV / XLS / PDF) via a flat line table + a rich summary subtitle.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { tankerReconciliation, carryForwardOutForTanker, type TankerRecon, type ReconLine } from "./reconcile";
import type { MilkReport } from "./reports";

const nL = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString("en-IN") + " L";
const rup = (p: number) => "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN");
const rupp = (p: number) => "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FrozenRow = Awaited<ReturnType<typeof db.tankerClosingReport.findUnique>>;

/** Rebuild the TankerRecon view-shape from a frozen closing row + the (immutable) tanker facts. */
async function fromFrozen(row: NonNullable<FrozenRow>): Promise<TankerRecon | null> {
  const t = await db.milkTanker.findUnique({ where: { id: row.tankerId } });
  if (!t) return null;
  const IST = 5.5 * 3600e3, istISO = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
  const lines = (row.linesJson as { retail?: ReconLine[]; b2b?: ReconLine[] }) ?? {};
  const retailLines = lines.retail ?? [], b2bLines = lines.b2b ?? [];
  const procIso = istISO(t.procurementDate);
  const cfIn = Math.round([...retailLines, ...b2bLines].filter((l) => l.date < procIso).reduce((s, l) => s + l.litres, 0) * 100) / 100;
  // carry-forward OUT is a LIVE "still-pending" value — compute it dynamically even for a frozen
  // report (it drops to 0 once the next tanker absorbs the pending), never freeze it at close.
  const cfOut = await carryForwardOutForTanker(row.tankerId);
  return {
    tanker: { id: t.id, code: t.code, tankerNo: t.tankerNo, supplier: t.supplier, procurementDate: istISO(t.procurementDate), quantityKg: t.quantityKg, fatPct: t.fatPct, litres: t.litres, freshoutKg: Math.round(t.freshoutKg * 100) / 100, freshoutLitres: Math.round(t.freshoutLitres * 100) / 100, consumedLitres: Math.round(t.consumedLitres * 100) / 100, remainingLitres: Math.round(t.remainingLitres * 100) / 100, costPerLitrePaise: t.costPerLitrePaise, milkCostPaise: t.milkCostPaise, fatCostPaise: t.fatCostPaise, transportPaise: t.transportPaise, totalCostPaise: t.totalCostPaise, status: t.status, closedAt: t.closedAt ? t.closedAt.toISOString() : row.closedAt.toISOString() },
    retail: { customers: row.retailCustomers, deliveries: row.retailDeliveries, litres: row.retailLitres, revenuePaise: row.retailRevenuePaise, lines: retailLines },
    b2b: { businesses: row.b2bBusinesses, deliveries: row.b2bDeliveries, litres: row.b2bLitres, revenuePaise: row.b2bRevenuePaise, lines: b2bLines },
    usage: { openingLitres: row.openingLitres, freshoutLitres: row.freshoutLitres, totalAvailableLitres: Math.round((row.openingLitres + row.freshoutLitres) * 100) / 100, retailLitres: row.retailLitres, b2bLitres: row.b2bLitres, wastageLitres: row.wastageLitres, carryForwardInLitres: cfIn, carryForwardOutLitres: cfOut, availableAfterCarryForward: Math.round((row.openingLitres + row.freshoutLitres - cfIn) * 100) / 100, carryForwardLitres: row.carryForwardLitres, closingLitres: row.closingLitres },
    financial: { retailRevenuePaise: row.retailRevenuePaise, b2bRevenuePaise: row.b2bRevenuePaise, totalRevenuePaise: row.totalRevenuePaise, procurementCostPaise: row.procurementCostPaise, transportPaise: row.transportPaise, totalCostPaise: row.totalCostPaise, cogsPaise: row.cogsPaise, grossProfitPaise: row.grossProfitPaise, netProfitPaise: row.netProfitPaise },
    reconciled: true,
  };
}

/** Freeze a reconciliation into the immutable TankerClosingReport (idempotent — never overwrites). */
export async function freezeTankerReport(tankerId: string, recon: TankerRecon, meta: { closedById?: string | null; closedByRole?: string | null; closeReason?: string | null; forced?: boolean } = {}) {
  await db.tankerClosingReport.upsert({
    where: { tankerId },
    update: {},   // IMMUTABLE — once frozen, never rewritten (historical data must not change)
    create: {
      tankerId,
      closedAt: recon.tanker.closedAt ? new Date(recon.tanker.closedAt) : new Date(),
      closedById: meta.closedById ?? null, closedByRole: meta.closedByRole ?? null, closeReason: meta.closeReason ?? null, forced: meta.forced ?? false,
      openingLitres: recon.usage.openingLitres, freshoutKg: recon.tanker.freshoutKg, freshoutLitres: recon.usage.freshoutLitres, retailLitres: recon.usage.retailLitres, b2bLitres: recon.usage.b2bLitres, wastageLitres: recon.usage.wastageLitres, carryForwardLitres: recon.usage.carryForwardLitres, closingLitres: recon.usage.closingLitres,
      retailRevenuePaise: recon.financial.retailRevenuePaise, b2bRevenuePaise: recon.financial.b2bRevenuePaise, totalRevenuePaise: recon.financial.totalRevenuePaise, procurementCostPaise: recon.financial.procurementCostPaise, transportPaise: recon.financial.transportPaise, totalCostPaise: recon.financial.totalCostPaise, cogsPaise: recon.financial.cogsPaise, grossProfitPaise: recon.financial.grossProfitPaise, netProfitPaise: recon.financial.netProfitPaise,
      retailCustomers: recon.retail.customers, retailDeliveries: recon.retail.deliveries, b2bBusinesses: recon.b2b.businesses, b2bDeliveries: recon.b2b.deliveries,
      linesJson: { retail: recon.retail.lines, b2b: recon.b2b.lines } as object,
    },
  });
}

/** The tanker report: frozen snapshot for a closed tanker (freezing lazily if needed), else live. */
export async function getTankerReport(tankerId: string): Promise<{ recon: TankerRecon; frozen: boolean } | null> {
  const t = await db.milkTanker.findUnique({ where: { id: tankerId }, select: { id: true, status: true, deletedAt: true } });
  if (!t || t.deletedAt) return null;
  const existing = await db.tankerClosingReport.findUnique({ where: { tankerId } });
  if (existing) { const recon = await fromFrozen(existing); return recon ? { recon, frozen: true } : null; }
  const recon = await tankerReconciliation(tankerId);
  if (!recon) return null;
  if (t.status === "CLOSED") { await freezeTankerReport(tankerId, recon).catch(() => {}); return { recon, frozen: true }; }
  return { recon, frozen: false };   // OPEN → live
}

/** Flat, printable table (reused by CSV/XLS/PDF) — line detail + a rich reconciliation subtitle. */
export function buildTankerReportTable(recon: TankerRecon): MilkReport {
  const t = recon.tanker, f = recon.financial, u = recon.usage;
  const line = (l: ReconLine) => [l.date, l.channel === "RETAIL" ? "Retail" : "B2B", l.name, l.orderCode ?? l.orderId?.slice(-6) ?? "—", l.product || l.qty, nL(l.litres), rupp(l.revenuePaise), rupp(l.costPaise), rupp(l.revenuePaise - l.costPaise)];
  const rows = [...recon.retail.lines, ...recon.b2b.lines].map(line);
  const subtitle =
    `${t.tankerNo} · ${t.supplier} · procured ${t.procurementDate} · ${t.quantityKg} kg @ ${t.fatPct}% → ${nL(t.litres)} @ ${rupp(t.costPerLitrePaise)}/L (procurement ${rupp(f.procurementCostPaise)} + transport ${rupp(f.transportPaise)} = ${rupp(f.totalCostPaise)}) · ` +
    `USAGE opening ${nL(u.openingLitres)}${u.freshoutLitres ? " + freshout " + nL(u.freshoutLitres) + " (" + (Math.round(t.freshoutKg * 100) / 100) + "kg)" : ""}${u.carryForwardInLitres ? " + carry-fwd in " + nL(u.carryForwardInLitres) : ""} − retail ${nL(u.retailLitres)} − B2B ${nL(u.b2bLitres)}${u.wastageLitres ? " − wastage " + nL(u.wastageLitres) : ""} = closing ${nL(u.closingLitres)} · ` +
    `RETAIL ${recon.retail.customers} cust / ${recon.retail.deliveries} del ${rup(f.retailRevenuePaise)} · B2B ${recon.b2b.businesses} biz / ${recon.b2b.deliveries} del ${rup(f.b2bRevenuePaise)} · ` +
    `REVENUE ${rup(f.totalRevenuePaise)} − COGS ${rup(f.cogsPaise)} = GROSS ${rup(f.grossProfitPaise)}${recon.reconciled ? " · reconciled ✓" : " · ⚠ not reconciled"} · ${t.status}`;
  return {
    type: "tankerClosing" as unknown as MilkReport["type"],
    title: `Tanker Closing Report — ${t.code}`,
    subtitle, rowCount: rows.length,
    columns: [{ label: "Date" }, { label: "Channel" }, { label: "Customer / Business" }, { label: "Order" }, { label: "Product / Items" }, { label: "Litres", right: true }, { label: "Revenue", right: true }, { label: "COGS", right: true }, { label: "Profit", right: true }],
    rows,
    totalRow: ["TOTAL", "", `${recon.retail.deliveries + recon.b2b.deliveries} line(s)`, "", "", nL(u.retailLitres + u.b2bLitres), rupp(f.totalRevenuePaise), rupp(f.cogsPaise), rupp(f.grossProfitPaise)],
  };
}

export const tankerReportFilename = (code: string, ext: string) => `DOODLY_Tanker_${code}_${new Date().toISOString().slice(0, 10)}.${ext}`;
