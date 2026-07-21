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
import { computeTankerCost } from "@/lib/milk/cost";
import { getMilkConfig } from "@/lib/milk/config";

const EPS = 1e-6;

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

export async function deleteTanker(id: string, actor?: { actorId?: string; actorRole?: string }) {
  const t = await db.milkTanker.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw Errors.notFound("Tanker not found.");
  if (t.consumedLitres > EPS) throw Errors.badRequest("This tanker has milk already drawn from it — it can't be deleted.");
  await db.milkTanker.update({ where: { id }, data: { deletedAt: new Date(), status: "CLOSED", closedAt: new Date() } });
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "milk.tanker.delete", target: t.code }).catch(() => {});
  return { ok: true };
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
