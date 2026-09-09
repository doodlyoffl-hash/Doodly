/* =============================================================
   DOODLY — Continuity Tanker Engine (spec §29).
   A METADATA layer over the existing global-FIFO inventory engine — it never
   changes how milk is consumed (fifo.ts consumeLitres stays the single truth).
   It records, at tanker-add time, whether a tanker starts a fresh chain (PRIMARY)
   or continues an earlier tanker that still had stock (CONTINUITY), and exposes
   chain summaries, the weighted active FAT metric, an add-time preview, and a
   read-only integrity validator. All quantities are LITRES; money is paise.
   ============================================================= */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { getInventory } from "@/lib/milk/tanker";
import { milkInventorySummary } from "@/lib/milk/inventory";

export type ContinuityMode = "PRIMARY" | "CONTINUITY" | "AUTO";

const EPS = 1e-6;
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

async function nextChainCode(tx: Prisma.TransactionClient): Promise<string> {
  const y = new Date(Date.now() + 5.5 * 3600e3).getUTCFullYear();
  const key = `continuityChain:${y}`;
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `CHAIN-${y}-${String(row.value).padStart(4, "0")}`;
}

/** The active predecessor when a new tanker arrives = the newest OPEN tanker (other than
 *  `exceptId`) that still has stock and was procured on/before `on`. */
async function activePredecessor(tx: Prisma.TransactionClient, exceptId: string, on: Date) {
  return tx.milkTanker.findFirst({
    where: { id: { not: exceptId }, deletedAt: null, status: "OPEN", remainingLitres: { gt: EPS }, procurementDate: { lte: on } },
    orderBy: [{ procurementDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, code: true, continuityChainId: true, continuitySequence: true },
  });
}

/** Assign continuity metadata to a freshly-created tanker (runs INSIDE createTanker's tx).
 *  `mode` is the operator's choice from the Add-Tanker form:
 *    - "AUTO"       → the engine decides: PRIMARY when no earlier tanker still had stock,
 *                     else CONTINUITY of that tanker's chain (the original behaviour).
 *    - "PRIMARY"    → force a fresh chain even if stock remains (a deliberately separate batch).
 *    - "CONTINUITY" → continue the active predecessor's chain; rejected (400) if there is no
 *                     open tanker with remaining stock to continue.
 *  FIFO consumption is unaffected either way — this is only the chain grouping. */
export async function assignContinuityOnCreate(tx: Prisma.TransactionClient, newTankerId: string, mode: ContinuityMode = "AUTO"): Promise<{ continuityType: "PRIMARY" | "CONTINUITY"; continuityChainId: string; continuitySequence: number; parentTankerId: string | null }> {
  const t = await tx.milkTanker.findUniqueOrThrow({ where: { id: newTankerId }, select: { procurementDate: true } });
  const pred = await activePredecessor(tx, newTankerId, t.procurementDate);

  if (mode === "CONTINUITY" && !pred) {
    throw Errors.badRequest("Cannot add a Continuity tanker — there is no open tanker with remaining stock to continue. Add it as a Primary tanker.");
  }
  const asContinuity = mode === "CONTINUITY" || (mode === "AUTO" && !!pred);

  if (!asContinuity || !pred) {
    // PRIMARY — start a fresh chain (chosen, or nothing to continue).
    const chainId = await nextChainCode(tx);
    await tx.milkTanker.update({ where: { id: newTankerId }, data: { continuityType: "PRIMARY", continuityChainId: chainId, continuitySequence: 1, parentTankerId: null } });
    return { continuityType: "PRIMARY", continuityChainId: chainId, continuitySequence: 1, parentTankerId: null };
  }

  // CONTINUITY — continue the active predecessor's chain (predecessor may predate the
  // continuity feature and lack a chainId → start one for it).
  let chainId = pred.continuityChainId;
  if (!chainId) {
    chainId = await nextChainCode(tx);
    await tx.milkTanker.update({ where: { id: pred.id }, data: { continuityChainId: chainId, continuityType: "PRIMARY", continuitySequence: 1 } });
  }
  const sequence = (pred.continuitySequence || 1) + 1;
  await tx.milkTanker.update({ where: { id: newTankerId }, data: { continuityType: "CONTINUITY", continuityChainId: chainId, continuitySequence: sequence, parentTankerId: pred.id } });
  return { continuityType: "CONTINUITY", continuityChainId: chainId, continuitySequence: sequence, parentTankerId: pred.id };
}

/** Add-time preview (read-only) for the Add-Tanker form: what the new quantity becomes and
 *  whether it will be PRIMARY or CONTINUITY. `newLitres` is the new tanker's usable litres. */
export async function continuityPreview(newLitres: number, newFatPct?: number) {
  const now = new Date();
  const openLots = await db.milkTanker.findMany({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: EPS } }, orderBy: [{ procurementDate: "desc" }, { createdAt: "desc" }], select: { id: true, code: true, remainingLitres: true, fatPct: true, continuityChainId: true, continuitySequence: true } });
  const carriedForward = r2(openLots.reduce((s, l) => s + l.remainingLitres, 0));
  const pred = openLots[0] || null;
  const isContinuity = !!pred;
  const activeAvailability = r2(carriedForward + (newLitres || 0));

  // weighted active FAT preview (existing open remaining + the new litres at newFat)
  let weightedFat: number | null = null;
  if (newFatPct != null) {
    const num = openLots.reduce((s, l) => s + l.remainingLitres * l.fatPct, 0) + (newLitres || 0) * newFatPct;
    const den = carriedForward + (newLitres || 0);
    weightedFat = den > 0 ? Math.round((num / den) * 100) / 100 : null;
  }

  return {
    continuityType: isContinuity ? "CONTINUITY" : "PRIMARY",
    parentCode: pred?.code ?? null,
    continuityChainId: pred?.continuityChainId ?? null,     // null → a fresh chain will be created
    carriedForwardLitres: carriedForward,
    newLitres: r2(newLitres || 0),
    activeAvailabilityLitres: activeAvailability,
    weightedActiveFat: weightedFat,
    openLots: openLots.map((l) => ({ code: l.code, remainingLitres: r2(l.remainingLitres), fatPct: l.fatPct })),
  };
}

/** Weighted active FAT over all OPEN remaining milk (Σ qty×FAT / Σ qty). Read-only metric. */
export async function weightedActiveFat(): Promise<{ litres: number; weightedFat: number | null }> {
  const lots = await db.milkTanker.findMany({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: EPS } }, select: { remainingLitres: true, fatPct: true } });
  const den = lots.reduce((s, l) => s + l.remainingLitres, 0);
  const num = lots.reduce((s, l) => s + l.remainingLitres * l.fatPct, 0);
  return { litres: r2(den), weightedFat: den > 0 ? Math.round((num / den) * 100) / 100 : null };
}

const chainTankerSelect = { id: true, code: true, procurementDate: true, tankerNo: true, supplier: true, fatPct: true, litres: true, freshoutLitres: true, consumedLitres: true, remainingLitres: true, totalCostPaise: true, status: true, continuityType: true, continuitySequence: true, parentTankerId: true, createdAt: true } as const;

function chainTotals(tankers: Array<{ litres: number; freshoutLitres: number; consumedLitres: number; remainingLitres: number; totalCostPaise: number; fatPct: number; status: string }>) {
  const originalLitres = tankers.reduce((s, t) => s + t.litres, 0);
  const freshoutLitres = tankers.reduce((s, t) => s + t.freshoutLitres, 0);
  const consumedLitres = tankers.reduce((s, t) => s + t.consumedLitres, 0);
  const remainingLitres = tankers.reduce((s, t) => s + t.remainingLitres, 0);
  const procurementCashPaise = tankers.reduce((s, t) => s + t.totalCostPaise, 0);
  const openRemain = tankers.filter((t) => t.status === "OPEN").reduce((s, t) => s + t.remainingLitres, 0);
  const wfNum = tankers.filter((t) => t.status === "OPEN").reduce((s, t) => s + t.remainingLitres * t.fatPct, 0);
  return {
    originalLitres: r2(originalLitres), freshoutLitres: r2(freshoutLitres), effectiveLitres: r2(originalLitres + freshoutLitres),
    consumedLitres: r2(consumedLitres), currentAvailableLitres: r2(openRemain), remainingLitres: r2(remainingLitres),
    procurementCashPaise, tankers: tankers.length,
    weightedActiveFat: openRemain > 0 ? Math.round((wfNum / openRemain) * 100) / 100 : null,
  };
}

/** One continuity chain: its tankers (in sequence) + totals. */
export async function getChain(chainId: string) {
  const tankers = await db.milkTanker.findMany({ where: { deletedAt: null, continuityChainId: chainId }, orderBy: [{ continuitySequence: "asc" }, { procurementDate: "asc" }], select: chainTankerSelect });
  return { chainId, tankers: tankers.map((t) => ({ ...t, litres: r2(t.litres), freshoutLitres: r2(t.freshoutLitres), consumedLitres: r2(t.consumedLitres), remainingLitres: r2(t.remainingLitres) })), totals: chainTotals(tankers) };
}

/** All chains that currently have OPEN stock (for the chain list), newest first. */
export async function listActiveChains() {
  const open = await db.milkTanker.groupBy({ by: ["continuityChainId"], where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: EPS } }, _sum: { remainingLitres: true } });
  const ids = open.map((o) => o.continuityChainId).filter(Boolean) as string[];
  const chains = await Promise.all(ids.map((id) => getChain(id)));
  return chains.sort((a, b) => (b.chainId > a.chainId ? 1 : -1));
}

/** Read-only integrity validator (spec §42) — never mutates data. */
export async function validateChainIntegrity() {
  const issues: Array<{ severity: "error" | "warn"; tankerCode?: string; chainId?: string; message: string }> = [];
  const [tankers, consByTanker, inv, summary] = await Promise.all([
    db.milkTanker.findMany({ where: { deletedAt: null }, select: { id: true, code: true, litres: true, freshoutLitres: true, consumedLitres: true, remainingLitres: true, status: true, continuityType: true, continuityChainId: true, parentTankerId: true } }),
    db.tankerConsumption.groupBy({ by: ["tankerId"], _sum: { litres: true } }),
    getInventory(),
    milkInventorySummary(),
  ]);
  const drawnBy = new Map(consByTanker.map((c) => [c.tankerId, c._sum.litres ?? 0]));
  const byId = new Map(tankers.map((t) => [t.id, t]));

  for (const t of tankers) {
    const usable = t.litres + t.freshoutLitres;
    if (Math.abs(usable - t.consumedLitres - t.remainingLitres) > 0.5) issues.push({ severity: "error", tankerCode: t.code, message: `remaining (${r2(t.remainingLitres)}) ≠ usable ${r2(usable)} − consumed ${r2(t.consumedLitres)}` });
    if (t.remainingLitres < -EPS) issues.push({ severity: "error", tankerCode: t.code, message: `negative remaining (${r2(t.remainingLitres)})` });
    const drawn = drawnBy.get(t.id) ?? 0;
    if (Math.abs(drawn - t.consumedLitres) > 0.5) issues.push({ severity: "error", tankerCode: t.code, message: `ledger draw ${r2(drawn)} ≠ consumedLitres ${r2(t.consumedLitres)}` });
    if (t.status === "CLOSED" && t.remainingLitres > 0.5) issues.push({ severity: "warn", tankerCode: t.code, message: `CLOSED but ${r2(t.remainingLitres)} L remaining` });
    if (!t.continuityChainId) issues.push({ severity: "warn", tankerCode: t.code, message: "no continuity chain assigned" });
    if (t.continuityType === "CONTINUITY" && (!t.parentTankerId || !byId.has(t.parentTankerId))) issues.push({ severity: "error", tankerCode: t.code, message: "CONTINUITY tanker with missing/invalid parent" });
    if (t.parentTankerId) { const p = byId.get(t.parentTankerId); if (p && p.continuityChainId !== t.continuityChainId) issues.push({ severity: "error", tankerCode: t.code, message: `chain mismatch with parent ${p.code}` }); }
  }
  if (Math.abs(inv.remainingLitres - summary.closingBalance) > 0.5) issues.push({ severity: "error", message: `live inventory ${r2(inv.remainingLitres)} L ≠ ledger closing ${r2(summary.closingBalance)} L` });

  return { checkedTankers: tankers.length, healthy: issues.filter((i) => i.severity === "error").length === 0, issues };
}
