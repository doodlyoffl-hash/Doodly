/* =============================================================
   DOODLY — Milk tanker service (create / edit / list / inventory).
   Creating a tanker computes its cost from the CURRENT config, SNAPSHOTS the
   rates onto the row (so a later rate change never rewrites this batch), and
   opens a FIFO lot (remainingLitres = litres). A tanker can only be edited or
   deleted while it is OPEN and nothing has been drawn from it — once milk has
   been consumed its profit is in play and the batch is locked.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import { istDayWindow } from "@/lib/delivery/stats";
import { computeTankerCost, litresOf } from "@/lib/milk/cost";
import { getMilkConfig } from "@/lib/milk/config";
import { tankerReconciliation } from "@/lib/milk/reconcile";
import { freezeTankerReport, getTankerReport } from "@/lib/milk/tanker-report";

const EPS = 1e-6;
const round3 = (n: number) => Math.round((n || 0) * 1000) / 1000;

async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

export interface TankerInput {
  procurementDate?: string | null;   // "YYYY-MM-DD" IST; default today IST
  tankerNo: string;
  supplier: string;
  farmerId?: string | null;
  quantityKg: number;
  fatPct: number;
  snfPct?: number | null;
  transportPaise?: number | null;    // per-tanker override; default from config
  remarks?: string | null;
}

export async function createTanker(input: TankerInput, actor?: { actorId?: string; actorRole?: string }) {
  if (!input.tankerNo?.trim()) throw Errors.badRequest("Tanker number is required.");
  if (!input.supplier?.trim()) throw Errors.badRequest("Supplier / farmer group is required.");
  if (!(Number(input.quantityKg) > 0)) throw Errors.badRequest("Quantity (KG) must be greater than 0.");
  if (Number(input.fatPct) < 0) throw Errors.badRequest("FAT % cannot be negative.");

  const cfg = await getMilkConfig();
  const transportPaise = input.transportPaise != null ? Math.max(0, Math.round(Number(input.transportPaise))) : cfg.transportPaise;
  const cost = computeTankerCost({
    quantityKg: input.quantityKg, fatPct: input.fatPct,
    rates: { conversionFactor: cfg.conversionFactor, milkRatePaise: cfg.milkRatePaise, fatRatePaise: cfg.fatRatePaise, transportPaise },
  });
  const { start, iso } = istDayWindow(input.procurementDate ?? undefined);

  const created = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, `tanker:${iso}`);
    const code = `TNK-${iso.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`;
    return tx.milkTanker.create({
      data: {
        code, procurementDate: start, tankerNo: input.tankerNo.trim(), supplier: input.supplier.trim(),
        farmerId: input.farmerId || null,
        quantityKg: cost.quantityKg, fatPct: input.fatPct, snfPct: input.snfPct ?? null, remarks: input.remarks ?? null,
        conversionFactor: cfg.conversionFactor, milkRatePaise: cfg.milkRatePaise, fatRatePaise: cfg.fatRatePaise,
        litres: cost.litres, kgFat: cost.kgFat,
        milkCostPaise: cost.milkCostPaise, fatCostPaise: cost.fatCostPaise, transportPaise: cost.transportPaise,
        totalCostPaise: cost.totalCostPaise, costPerLitrePaise: cost.costPerLitrePaise, costPerKgPaise: cost.costPerKgPaise,
        consumedLitres: 0, remainingLitres: cost.litres, status: "OPEN",
        createdById: actor?.actorId ?? null,
      },
    });
  });
  await audit({
    userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system",
    action: "milk.tanker.create",
    target: `${created.code} · ${created.tankerNo} · ${cost.quantityKg}kg @ ${input.fatPct}% · ${cost.litres}L · ₹${(cost.totalCostPaise / 100).toFixed(2)}`,
  }).catch(() => {});

  // FIFO carry-forward: this fresh tanker automatically absorbs any PENDING allocation (days
  // whose sales exceeded stock, waiting for the next tanker). Re-settling each pending day
  // redraws FIFO — drained older lots restore + re-drain, and THIS lot takes the overflow;
  // settleDay then clears the pending row. Best-effort — never blocks the create.
  try {
    const { settleDay, listPendingAllocations } = await import("@/lib/milk/settle");
    const { istISO } = await import("@/lib/delivery/stats");
    const pending = await listPendingAllocations();
    for (const p of pending) {
      const dayIso = istISO(p.date);
      const res = await settleDay(dayIso, { actorId: actor?.actorId, actorRole: actor?.actorRole ?? "system", quiet: true, clearedByTankerId: created.id });
      const absorbed = Math.max(0, p.totalLitres - res.shortfallLitres);
      if (absorbed > EPS) await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.carryforward.applied", target: `${created.code} absorbed ${Math.round(absorbed * 100) / 100}L pending from ${dayIso}${res.shortfallLitres > EPS ? ` · ${Math.round(res.shortfallLitres * 100) / 100}L still pending` : " · cleared"}` }).catch(() => {});
    }
  } catch { /* carry-forward absorb is best-effort — never blocks tanker creation */ }
  return created;
}

export async function updateTanker(id: string, patch: Partial<TankerInput>, actor?: { actorId?: string; actorRole?: string }) {
  const t = await db.milkTanker.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw Errors.notFound("Tanker not found.");
  if (t.consumedLitres > EPS || t.status === "CLOSED") throw Errors.badRequest("This tanker has milk already drawn from it (profit locked) — it can no longer be edited.");

  const cfg = await getMilkConfig();
  // Editing recomputes cost against the tanker's own snapshotted rates (not the
  // current config), so correcting a typo doesn't silently re-price the batch.
  const quantityKg = patch.quantityKg != null ? Number(patch.quantityKg) : t.quantityKg;
  const fatPct = patch.fatPct != null ? Number(patch.fatPct) : t.fatPct;
  const transportPaise = patch.transportPaise != null ? Math.max(0, Math.round(Number(patch.transportPaise))) : t.transportPaise;
  if (!(quantityKg > 0)) throw Errors.badRequest("Quantity (KG) must be greater than 0.");
  const cost = computeTankerCost({ quantityKg, fatPct, rates: { conversionFactor: t.conversionFactor, milkRatePaise: t.milkRatePaise, fatRatePaise: t.fatRatePaise, transportPaise } });

  const updated = await db.milkTanker.update({
    where: { id },
    data: {
      tankerNo: patch.tankerNo?.trim() ?? t.tankerNo,
      supplier: patch.supplier?.trim() ?? t.supplier,
      farmerId: patch.farmerId !== undefined ? (patch.farmerId || null) : t.farmerId,
      quantityKg: cost.quantityKg, fatPct, snfPct: patch.snfPct !== undefined ? patch.snfPct : t.snfPct,
      remarks: patch.remarks !== undefined ? patch.remarks : t.remarks,
      litres: cost.litres, kgFat: cost.kgFat,
      milkCostPaise: cost.milkCostPaise, fatCostPaise: cost.fatCostPaise, transportPaise: cost.transportPaise,
      totalCostPaise: cost.totalCostPaise, costPerLitrePaise: cost.costPerLitrePaise, costPerKgPaise: cost.costPerKgPaise,
      remainingLitres: cost.litres,   // unconsumed, so remaining == litres
    },
  });
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.update", target: `${updated.code} · ${cost.litres}L · ₹${(cost.totalCostPaise / 100).toFixed(2)}` }).catch(() => {});
  return updated;
}

/**
 * Add Freshout Milk to a tanker — extra litres extracted from the SAME tanker after it
 * reads "empty" (outlet/pipeline residue). This is NOT a new procurement:
 *   • usable capacity grows:   remainingLitres += freshoutLitres  (lot re-opens if it had drained)
 *   • total cost is UNCHANGED: costPerLitre re-dilutes to totalCost / (litres + freshout)
 *   • FIFO is preserved:       it's the SAME (oldest) lot, so it is always consumed before the
 *                              next tanker; deliveries stay linked to this tanker.
 * Then the affected days re-settle: this tanker's already-consumed days (so their FROZEN
 * TankerConsumption.costPaise — which the daily P&L sums — refresh at the new diluted rate)
 * and any PENDING allocation days (so the fresh capacity absorbs the overflow, exactly like a
 * new tanker's arrival). Multiple entries are allowed and summed. Cannot be added once the
 * tanker is permanently CLOSED.
 */
export async function addFreshout(id: string, input: { quantityKg: number; remarks?: string | null }, actor?: { actorId?: string; actorRole?: string }) {
  const kg = Number(input.quantityKg);
  if (!(kg > 0)) throw Errors.badRequest("Freshout quantity (KG) must be greater than 0.");

  const t = await db.milkTanker.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw Errors.notFound("Tanker not found.");
  // A tanker that merely DRAINED (fifo auto-sets status=CLOSED at zero) is only "awaiting final
  // closure" — Freshout is exactly meant for that moment, so it re-opens the lot. Only a MANUAL,
  // permanent close blocks it. Manual close stamps closedByRole on the frozen report; a lazy
  // freeze-on-view leaves it null, and that stale snapshot is dropped as the tanker re-opens.
  if (t.status === "CLOSED") {
    const frozen = await db.tankerClosingReport.findUnique({ where: { tankerId: t.id }, select: { closedByRole: true } });
    if (frozen?.closedByRole) throw Errors.badRequest("This tanker has been permanently closed — Freshout can no longer be added.");
    if (frozen) await db.tankerClosingReport.delete({ where: { tankerId: t.id } }).catch(() => {});
  }

  const litres = litresOf(kg, t.conversionFactor);               // same conversion as procurement
  const prevKg = t.freshoutKg, prevLitres = t.freshoutLitres;
  const newFreshoutKg = prevKg + kg;
  const newFreshoutLitres = prevLitres + litres;
  const usableLitres = t.litres + newFreshoutLitres;             // opening + all freshout
  // Cost is diluted, NOT increased: the same procurement cost now covers more usable litres,
  // so total COGS over the full lot still equals procurement cost (Step 9 — no new purchase).
  const costPerLitrePaise = usableLitres > 0 ? Math.round(t.totalCostPaise / usableLitres) : t.costPerLitrePaise;
  const costPerKgPaise = (t.quantityKg + newFreshoutKg) > 0 ? Math.round(t.totalCostPaise / (t.quantityKg + newFreshoutKg)) : t.costPerKgPaise;

  const entry = await db.$transaction(async (tx) => {
    const e = await tx.milkTankerFreshout.create({ data: { tankerId: t.id, quantityKg: round3(kg), litres: round3(litres), conversionFactor: t.conversionFactor, enteredById: actor?.actorId ?? null, remarks: input.remarks ?? null } });
    await tx.milkTanker.update({
      where: { id: t.id },
      data: {
        freshoutKg: round3(newFreshoutKg), freshoutLitres: round3(newFreshoutLitres),
        remainingLitres: { increment: litres },
        costPerLitrePaise, costPerKgPaise,
        // re-open a lot that had drained to zero — its freshout residue is now sellable stock
        ...(t.status === "CLOSED" ? { status: "OPEN" as const, closedAt: null } : {}),
      },
    });
    return e;
  });

  await audit({
    userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system",
    action: "milk.freshout.added",
    // Step 13: tanker id, KG, litres, previous → new value all captured in the trace.
    target: `${t.id} · ${t.code} · +${round3(kg)}kg → +${round3(litres)}L freshout · total ${round3(prevLitres)}L→${round3(newFreshoutLitres)}L (${round3(prevKg)}→${round3(newFreshoutKg)}kg) · cost/L ${t.costPerLitrePaise}→${costPerLitrePaise}p${input.remarks ? " · " + input.remarks : ""}`,
  }).catch(() => {});

  // Re-settle the affected days: this tanker's already-consumed days (refresh their frozen COGS
  // at the new diluted rate) ∪ any PENDING allocation days (absorb overflow into the freshout
  // capacity — same mechanism as a new tanker arriving). Oldest-first. Best-effort.
  try {
    const { settleDay, listPendingAllocations } = await import("@/lib/milk/settle");
    const { istISO } = await import("@/lib/delivery/stats");
    const myDays = await db.tankerConsumption.findMany({ where: { tankerId: t.id, channel: { in: ["RETAIL", "B2B"] } }, select: { date: true }, distinct: ["date"] });
    const pending = await listPendingAllocations();
    const dayIsos = new Set<string>();
    for (const d of myDays) dayIsos.add(istISO(d.date));
    for (const p of pending) dayIsos.add(istISO(p.date));
    const ordered = [...dayIsos].sort();
    for (const dayIso of ordered) await settleDay(dayIso, { actorId: actor?.actorId, actorRole: actor?.actorRole ?? "system", quiet: true, clearedByTankerId: t.id });
    if (ordered.length) await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.recalculated", target: `${t.code} · re-settled ${ordered.length} day(s) after freshout (${ordered[0]}…${ordered[ordered.length - 1]}) — COGS refreshed + pending absorbed` }).catch(() => {});
  } catch { /* re-settle after freshout is best-effort — never blocks the entry */ }

  return { ok: true as const, entry, freshoutLitres: round3(newFreshoutLitres), remainingLitres: round3(t.remainingLitres + litres), costPerLitrePaise };
}

export async function deleteTanker(id: string, actor?: { actorId?: string; actorRole?: string }) {
  const t = await db.milkTanker.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw Errors.notFound("Tanker not found.");
  if (t.consumedLitres > EPS) throw Errors.badRequest("This tanker has milk already drawn from it — it can't be deleted.");
  await db.milkTanker.update({ where: { id }, data: { deletedAt: new Date(), status: "CLOSED", closedAt: new Date() } });
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.delete", target: t.code }).catch(() => {});
  return { ok: true };
}

/**
 * Close a tanker. A tanker can only close once its milk is fully SOLD (≈0 remaining —
 * carry-forward to the next tanker is automatic via FIFO). A Super-Admin may FORCE-close a
 * tanker that still has milk: the leftover is written off as WASTAGE (an ADJUSTMENT draw).
 * On close, freeze the immutable Tanker Closing Report + audit. (force gate enforced at the API.)
 */
export async function closeTanker(args: { id: string; reason?: string | null; force?: boolean }, actor?: { actorId?: string; actorRole?: string }) {
  const t = await db.milkTanker.findUnique({ where: { id: args.id } });
  if (!t || t.deletedAt) throw Errors.notFound("Tanker not found.");
  if (t.status === "CLOSED") { await getTankerReport(args.id).catch(() => {}); return { ok: true as const, alreadyClosed: true, wastageLitres: 0 }; }

  const leftover = t.remainingLitres;
  if (leftover > EPS && !args.force) {
    throw Errors.badRequest(`Tanker still has ${Math.round(leftover * 100) / 100} L unsold — it carries forward automatically as it sells, or a Super-Admin can force-close it (the remainder is written off as wastage).`);
  }

  let wastage = 0;
  await db.$transaction(async (tx) => {
    if (leftover > EPS && args.force) {
      wastage = leftover;
      await tx.tankerConsumption.create({ data: { tankerId: t.id, date: new Date(), channel: "ADJUSTMENT", litres: leftover, costPaise: Math.round(leftover * t.costPerLitrePaise), sourceRef: `close-wastage:${t.id}`, note: `Wastage on manual close${args.reason ? " — " + args.reason : ""}` } });
      await tx.milkTanker.update({ where: { id: t.id }, data: { consumedLitres: { increment: leftover }, remainingLitres: 0, status: "CLOSED", closedAt: new Date() } });
    } else {
      await tx.milkTanker.update({ where: { id: t.id }, data: { status: "CLOSED", closedAt: new Date() } });
    }
  });

  // Freeze the immutable closing report from the fresh reconciliation (best-effort — never blocks the close).
  try { const recon = await tankerReconciliation(t.id); if (recon) await freezeTankerReport(t.id, recon, { closedById: actor?.actorId ?? null, closedByRole: actor?.actorRole ?? null, closeReason: args.reason ?? null, forced: wastage > EPS }); } catch { /* report can be frozen lazily on first view */ }

  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.close", target: `${t.code}${wastage > EPS ? ` · wastage ${Math.round(wastage * 100) / 100}L (forced)` : ""}${args.reason ? ` · ${args.reason}` : ""}` }).catch(() => {});
  if (wastage > EPS) await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.adjustment", target: `${t.code} · wastage ${Math.round(wastage * 100) / 100}L · ₹${(Math.round(wastage * t.costPerLitrePaise) / 100).toFixed(2)}` }).catch(() => {});
  return { ok: true as const, alreadyClosed: false, wastageLitres: Math.round(wastage * 100) / 100 };
}

export async function listTankers(q: { from?: string; to?: string; status?: string; search?: string } = {}) {
  const where: Prisma.MilkTankerWhereInput = { deletedAt: null };
  if (q.from || q.to) {
    where.procurementDate = {};
    if (q.from) (where.procurementDate as Prisma.DateTimeFilter).gte = istDayWindow(q.from).start;
    if (q.to) (where.procurementDate as Prisma.DateTimeFilter).lt = istDayWindow(q.to).end;
  }
  if (q.status === "OPEN" || q.status === "CLOSED") where.status = q.status;
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [{ code: { contains: s, mode: "insensitive" } }, { tankerNo: { contains: s, mode: "insensitive" } }, { supplier: { contains: s, mode: "insensitive" } }];
  }
  return db.milkTanker.findMany({ where, orderBy: [{ procurementDate: "desc" }, { createdAt: "desc" }], take: 500 });
}

/** Live inventory: open lots + carry-forward totals + a valuation of milk on hand. */
export async function getInventory() {
  const open = await db.milkTanker.findMany({
    where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: EPS } },
    orderBy: [{ procurementDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, procurementDate: true, tankerNo: true, supplier: true, litres: true, remainingLitres: true, costPerLitrePaise: true },
  });
  const remainingLitres = open.reduce((s, l) => s + l.remainingLitres, 0);
  const remainingValuePaise = open.reduce((s, l) => s + Math.round(l.remainingLitres * l.costPerLitrePaise), 0);
  return {
    openLots: open.map((l) => ({ ...l, valuePaise: Math.round(l.remainingLitres * l.costPerLitrePaise) })),
    openCount: open.length,
    remainingLitres: Math.round(remainingLitres * 100) / 100,
    remainingValuePaise,
  };
}

export async function tankerStats(dateIso?: string | null) {
  const { start, end } = istDayWindow(dateIso);
  const [today, lots, inv] = await Promise.all([
    db.milkTanker.aggregate({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, _sum: { quantityKg: true, litres: true, totalCostPaise: true }, _count: { _all: true } }),
    db.milkTanker.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    getInventory(),
  ]);
  const openTankers = lots.find((l) => l.status === "OPEN")?._count._all ?? 0;
  const closedTankers = lots.find((l) => l.status === "CLOSED")?._count._all ?? 0;
  const litresToday = today._sum.litres ?? 0;
  const cashToday = today._sum.totalCostPaise ?? 0;
  return {
    todayTankers: today._count._all,
    todayKg: Math.round((today._sum.quantityKg ?? 0) * 100) / 100,
    todayLitres: Math.round(litresToday * 100) / 100,
    todayCostPaise: cashToday,
    avgCostPerLitrePaise: litresToday > 0 ? Math.round(cashToday / litresToday) : 0,
    openTankers, closedTankers,
    inventoryLitres: inv.remainingLitres,
    inventoryValuePaise: inv.remainingValuePaise,
  };
}
