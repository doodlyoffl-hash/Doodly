/* =============================================================
   Per-ORDER → tanker allocation (spec §26). PERSISTS the existing
   reconciliation's derived per-order attribution (which reconciles with the
   ledger by construction) into MilkOrderAllocation — it does NOT change how
   milk is consumed. Frozen when a tanker closes; queryable per order so
   "which tanker(s) supplied this order" is auditable, including across a
   continuity chain (one order can draw from several tankers).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { tankerReconciliation } from "@/lib/milk/reconcile";

/** Freeze this tanker's per-order allocations from its reconciliation. Idempotent
 *  (upsert on tanker+channel+order). Returns the number of allocation rows written. */
export async function freezeOrderAllocations(tankerId: string): Promise<number> {
  const [recon, meta] = await Promise.all([
    tankerReconciliation(tankerId),
    db.milkTanker.findUnique({ where: { id: tankerId }, select: { continuityChainId: true } }),
  ]);
  if (!recon) return 0;
  const code = recon.tanker.code;
  const chainId = meta?.continuityChainId ?? null;
  const lines = [...recon.retail.lines, ...recon.b2b.lines];
  let n = 0;
  for (const l of lines) {
    const orderRef = l.orderId ?? l.subscriptionId ?? l.refId;
    if (!orderRef || l.litres <= 0) continue;
    const litres = Math.round(l.litres * 1000) / 1000;
    const common = { tankerCode: code, continuityChainId: chainId, orderLabel: l.orderCode ?? l.invoiceNumber ?? null, partyName: l.name, litres, costPaise: l.costPaise, revenuePaise: l.revenuePaise };
    await db.milkOrderAllocation.upsert({
      where: { tankerId_channel_orderRef: { tankerId, channel: l.channel, orderRef } },
      create: { tankerId, channel: l.channel, orderRef, saleDate: new Date(l.date + "T00:00:00Z"), ...common },
      update: common,
    });
    n++;
  }
  return n;
}

/** All tanker allocations for one order (across the chain) — the §26 audit answer. */
export async function getOrderAllocations(orderRef: string) {
  const rows = await db.milkOrderAllocation.findMany({ where: { orderRef }, orderBy: { saleDate: "asc" } });
  return {
    orderRef,
    totalLitres: Math.round(rows.reduce((s, r) => s + r.litres, 0) * 1000) / 1000,
    totalCostPaise: rows.reduce((s, r) => s + r.costPaise, 0),
    tankers: rows.map((r) => ({ tankerCode: r.tankerCode, continuityChainId: r.continuityChainId, channel: r.channel, litres: r.litres, costPaise: r.costPaise, revenuePaise: r.revenuePaise })),
  };
}
