/* =============================================================
   DOODLY — FIFO milk inventory consumption.
   Sold litres (retail + B2B) draw down tanker lots OLDEST-FIRST. When a lot
   hits zero it auto-closes (profit locked, no edits). Every draw is a
   TankerConsumption row whose cost = litres × that lot's snapshotted
   costPerLitrePaise — so cost follows the exact batch the milk came from.

   Consumption is REVERSIBLE by sourceRef: re-settling a day restores the lots
   (re-opening any that were closed) and re-consumes fresh, so the ledger is
   idempotent and safe to re-run when a day's deliveries change.

   Canonical unit throughout is LITRES. Callers pass a transaction client so a
   settle stays atomic.
   ============================================================= */
import "server-only";
import type { Prisma, ConsumptionChannel } from "@prisma/client";

const EPS = 1e-6;   // litres below this are "empty" (float dust)

export interface ConsumeResult {
  requestedLitres: number;
  allocatedLitres: number;
  costPaise: number;
  shortfallLitres: number;   // > 0 means inventory ran out (oversold vs stock)
  lots: { tankerId: string; code: string; litres: number; costPaise: number; closed: boolean }[];
}

/** Consume `litres` from OPEN lots, oldest procurementDate first. Writes one
 *  TankerConsumption row per lot touched and updates each lot's remaining +
 *  status. Never throws on shortfall — it reports it (a P&L must show oversell,
 *  not hide it). */
export async function consumeLitres(
  tx: Prisma.TransactionClient,
  args: { date: Date; channel: ConsumptionChannel; litres: number; sourceRef: string; note?: string },
): Promise<ConsumeResult> {
  const need0 = Math.max(0, Number(args.litres) || 0);
  const out: ConsumeResult = { requestedLitres: need0, allocatedLitres: 0, costPaise: 0, shortfallLitres: 0, lots: [] };
  if (need0 <= EPS) return out;

  let need = need0;
  // Oldest first. Re-query per iteration is avoided; we hold the list and mutate.
  const lots = await tx.milkTanker.findMany({
    where: { status: "OPEN", deletedAt: null, remainingLitres: { gt: EPS } },
    orderBy: [{ procurementDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, remainingLitres: true, costPerLitrePaise: true },
  });

  for (const lot of lots) {
    if (need <= EPS) break;
    const take = Math.min(need, lot.remainingLitres);
    if (take <= EPS) continue;
    const costPaise = Math.round(take * lot.costPerLitrePaise);
    const remaining = lot.remainingLitres - take;
    const closed = remaining <= EPS;

    await tx.tankerConsumption.create({
      data: { tankerId: lot.id, date: args.date, channel: args.channel, litres: take, costPaise, sourceRef: args.sourceRef, note: args.note ?? null },
    });
    await tx.milkTanker.update({
      where: { id: lot.id },
      data: {
        consumedLitres: { increment: take },
        remainingLitres: closed ? 0 : remaining,
        ...(closed ? { status: "CLOSED", closedAt: new Date() } : {}),
      },
    });

    out.allocatedLitres += take;
    out.costPaise += costPaise;
    out.lots.push({ tankerId: lot.id, code: lot.code, litres: take, costPaise, closed });
    need -= take;
  }

  out.shortfallLitres = Math.max(0, need);
  return out;
}

/** Undo every consumption written under `sourceRef`: restore each lot's litres
 *  (re-opening it if it had closed) and delete the rows. Returns litres restored.
 *  Groups by tanker so it's one read + one update PER LOT, not per row — fewer
 *  round-trips keeps the enclosing settle transaction well inside its budget. */
export async function reverseByRef(tx: Prisma.TransactionClient, sourceRef: string): Promise<number> {
  const rows = await tx.tankerConsumption.findMany({ where: { sourceRef }, select: { tankerId: true, litres: true } });
  if (!rows.length) return 0;

  const byLot = new Map<string, number>();
  for (const r of rows) byLot.set(r.tankerId, (byLot.get(r.tankerId) ?? 0) + r.litres);

  const lots = await tx.milkTanker.findMany({ where: { id: { in: [...byLot.keys()] } }, select: { id: true, remainingLitres: true, consumedLitres: true, litres: true } });
  let restored = 0;
  for (const lot of lots) {
    const back = byLot.get(lot.id) ?? 0;
    const remaining = Math.min(lot.litres, lot.remainingLitres + back);
    await tx.milkTanker.update({
      where: { id: lot.id },
      // Restoring litres re-opens a lot that had closed; a re-opened lot's profit
      // is unlocked again (correct — its consumption is being redone).
      data: { remainingLitres: remaining, consumedLitres: Math.max(0, lot.consumedLitres - back), status: "OPEN", closedAt: null },
    });
    restored += back;
  }
  await tx.tankerConsumption.deleteMany({ where: { sourceRef } });
  return restored;
}
