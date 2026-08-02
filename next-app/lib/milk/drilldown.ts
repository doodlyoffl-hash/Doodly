/* =============================================================
   DOODLY — Profit Centre drill-down: the B2B orders + tanker draws BEHIND the P&L.
   Two lenses (both requested):
     • Day-anchored  — for an IST day: the B2B orders (delivered + still-scheduled) and
                        the tanker lots that supplied that day's milk (retail vs B2B).
     • Tanker-anchored — each tanker with its total retail/B2B draw + remaining, and a
                        per-day draw history on demand.
   NOTE: milk is drawn FIFO at the DAY level (settleDay), not per order, so a day's B2B
   orders and that day's tanker draws are linked by the shared day — not order→tanker 1:1.
   Reads live from BusinessOrder + TankerConsumption (the same FIFO ledger the P&L uses).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";

const IST = 5.5 * 3600e3;
const istISO = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const net = (o: { totalPaise: number; taxPaise: number }) => Math.max(0, o.totalPaise - o.taxPaise);
const itemsOf = (items: { productName: string; quantity: number; unit: string }[]) => items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join(", ");

/** For one IST day: the B2B orders relevant to it + the tanker lots that fed that day. */
export async function dayDrilldown(dateIso?: string | null) {
  const { start, end, iso } = istDayWindow(dateIso);
  const [delivered, scheduled, draws] = await Promise.all([
    // recognised (delivered) that day — frozen net revenue drives the P&L
    db.businessOrder.findMany({
      where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } },
      select: { id: true, code: true, status: true, revenuePaise: true, totalPaise: true, taxPaise: true, deliveredAt: true, business: { select: { code: true, name: true } }, items: { select: { productName: true, quantity: true, unit: true } } },
      orderBy: { deliveredAt: "desc" }, take: 500,
    }),
    // scheduled for that day but not yet delivered (books nothing until delivered) — context
    db.businessOrder.findMany({
      where: { revenuePaise: null, status: { not: "CANCELLED" }, deliveryDate: { gte: start, lt: end } },
      select: { id: true, code: true, status: true, totalPaise: true, taxPaise: true, deliveryDate: true, business: { select: { code: true, name: true } }, items: { select: { productName: true, quantity: true, unit: true } } },
      orderBy: { createdAt: "desc" }, take: 500,
    }),
    db.tankerConsumption.groupBy({ by: ["tankerId", "channel"], where: { date: { gte: start, lt: end } }, _sum: { litres: true, costPaise: true } }),
  ]);

  const tankerIds = [...new Set(draws.map((d) => d.tankerId))];
  const tankers = tankerIds.length ? await db.milkTanker.findMany({ where: { id: { in: tankerIds } }, select: { id: true, code: true, supplier: true, procurementDate: true, costPerLitrePaise: true } }) : [];
  const tById = new Map(tankers.map((t) => [t.id, t]));
  const tMap = new Map<string, { code: string; supplier: string; procurementDate: string; costPerLitrePaise: number; retailLitres: number; retailCostPaise: number; b2bLitres: number; b2bCostPaise: number }>();
  for (const d of draws) {
    const t = tById.get(d.tankerId); if (!t) continue;
    const r = tMap.get(d.tankerId) ?? { code: t.code, supplier: t.supplier, procurementDate: istISO(t.procurementDate), costPerLitrePaise: t.costPerLitrePaise, retailLitres: 0, retailCostPaise: 0, b2bLitres: 0, b2bCostPaise: 0 };
    if (d.channel === "RETAIL") { r.retailLitres += d._sum.litres ?? 0; r.retailCostPaise += d._sum.costPaise ?? 0; }
    else if (d.channel === "B2B") { r.b2bLitres += d._sum.litres ?? 0; r.b2bCostPaise += d._sum.costPaise ?? 0; }
    tMap.set(d.tankerId, r);
  }

  const orders = [
    ...delivered.map((o) => ({ id: o.id, code: o.code, status: o.status, delivered: true, when: istISO(o.deliveredAt as Date), business: o.business?.name ?? "—", businessCode: o.business?.code ?? "", items: itemsOf(o.items), revenuePaise: o.revenuePaise ?? 0 })),
    ...scheduled.map((o) => ({ id: o.id, code: o.code, status: o.status, delivered: false, when: istISO(o.deliveryDate), business: o.business?.name ?? "—", businessCode: o.business?.code ?? "", items: itemsOf(o.items), revenuePaise: net(o) })),
  ];
  const deliveredRevenuePaise = delivered.reduce((s, o) => s + (o.revenuePaise ?? 0), 0);
  return {
    date: iso,
    orders,
    deliveredCount: delivered.length,
    scheduledCount: scheduled.length,
    deliveredRevenuePaise,
    tankers: [...tMap.values()].sort((a, b) => (a.procurementDate < b.procurementDate ? -1 : 1)),
  };
}

/** Every tanker + its lifetime retail/B2B draw split (for the tanker-anchored lens). */
export async function tankerList(limit = 80) {
  const tankers = await db.milkTanker.findMany({ where: { deletedAt: null }, orderBy: { procurementDate: "desc" }, take: Math.min(Math.max(limit, 1), 300), select: { id: true, code: true, supplier: true, procurementDate: true, litres: true, remainingLitres: true, costPerLitrePaise: true, status: true } });
  const ids = tankers.map((t) => t.id);
  const draws = ids.length ? await db.tankerConsumption.groupBy({ by: ["tankerId", "channel"], where: { tankerId: { in: ids } }, _sum: { litres: true, costPaise: true } }) : [];
  const byT = new Map<string, { retailLitres: number; retailCostPaise: number; b2bLitres: number; b2bCostPaise: number }>();
  for (const d of draws) {
    const r = byT.get(d.tankerId) ?? { retailLitres: 0, retailCostPaise: 0, b2bLitres: 0, b2bCostPaise: 0 };
    if (d.channel === "RETAIL") { r.retailLitres += d._sum.litres ?? 0; r.retailCostPaise += d._sum.costPaise ?? 0; }
    else if (d.channel === "B2B") { r.b2bLitres += d._sum.litres ?? 0; r.b2bCostPaise += d._sum.costPaise ?? 0; }
    byT.set(d.tankerId, r);
  }
  return tankers.map((t) => ({ id: t.id, code: t.code, supplier: t.supplier, procurementDate: istISO(t.procurementDate), litres: t.litres, remainingLitres: t.remainingLitres, costPerLitrePaise: t.costPerLitrePaise, status: t.status, ...(byT.get(t.id) ?? { retailLitres: 0, retailCostPaise: 0, b2bLitres: 0, b2bCostPaise: 0 }) }));
}

/** One tanker's per-day draw history (retail vs B2B), newest day first. */
export async function tankerDraws(tankerId: string) {
  const rows = await db.tankerConsumption.groupBy({ by: ["date", "channel"], where: { tankerId }, _sum: { litres: true, costPaise: true } });
  const byDay = new Map<string, { date: string; retailLitres: number; retailCostPaise: number; b2bLitres: number; b2bCostPaise: number }>();
  for (const d of rows) {
    const key = istISO(d.date);
    const r = byDay.get(key) ?? { date: key, retailLitres: 0, retailCostPaise: 0, b2bLitres: 0, b2bCostPaise: 0 };
    if (d.channel === "RETAIL") { r.retailLitres += d._sum.litres ?? 0; r.retailCostPaise += d._sum.costPaise ?? 0; }
    else if (d.channel === "B2B") { r.b2bLitres += d._sum.litres ?? 0; r.b2bCostPaise += d._sum.costPaise ?? 0; }
    byDay.set(key, r);
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
