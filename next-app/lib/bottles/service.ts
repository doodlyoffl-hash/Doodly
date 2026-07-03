/* =============================================================
   DOODLY — Bottle fleet service (reusable glass-bottle lifecycle)
   Two coupled views of the same fleet:
     • BottleStock   — physical bottles by capacity × lifecycle stage
                       (the warehouse / asset side)
     • BottleLedger  — per-customer ISSUED/RETURNED/LOST + deposits
                       (the customer-relationship side, pre-existing)
   Every fleet transition appends a BottleMovement (append-only), which
   doubles as bottle_movements + bottle_status_history. A movement can
   never drive any stage negative. Central AuditLog is written by the route.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

export type BottleStage =
  | "AVAILABLE" | "IN_CIRCULATION" | "AWAITING_COLLECTION" | "CLEANING" | "DAMAGED" | "LOST";

export const STAGES: BottleStage[] = ["AVAILABLE", "IN_CIRCULATION", "AWAITING_COLLECTION", "CLEANING", "DAMAGED", "LOST"];
export const CAPACITIES = [300, 500, 1000] as const;
const OWNED: BottleStage[] = ["AVAILABLE", "IN_CIRCULATION", "AWAITING_COLLECTION", "CLEANING", "DAMAGED"]; // LOST = written off

export const STAGE_LABEL: Record<BottleStage, string> = {
  AVAILABLE: "Available", IN_CIRCULATION: "In circulation", AWAITING_COLLECTION: "Awaiting collection",
  CLEANING: "Cleaning", DAMAGED: "Damaged", LOST: "Lost",
};
export const STAGE_TONE: Record<BottleStage, string> = {
  AVAILABLE: "green", IN_CIRCULATION: "blue", AWAITING_COLLECTION: "amber",
  CLEANING: "blue", DAMAGED: "red", LOST: "red",
};

// Canonical lifecycle graph. Admins may still move outside it (physical
// reality varies) but the UI defaults to these next-hops.
export const FLOW: Record<BottleStage, BottleStage[]> = {
  AVAILABLE: ["IN_CIRCULATION", "DAMAGED", "LOST"],
  IN_CIRCULATION: ["AWAITING_COLLECTION", "CLEANING", "DAMAGED", "LOST"],
  AWAITING_COLLECTION: ["CLEANING", "IN_CIRCULATION", "DAMAGED", "LOST"],
  CLEANING: ["AVAILABLE", "DAMAGED", "LOST"],
  DAMAGED: ["AVAILABLE", "LOST"],
  LOST: ["AVAILABLE"], // recovered
};

const blank = (): Record<BottleStage, number> => ({
  AVAILABLE: 0, IN_CIRCULATION: 0, AWAITING_COLLECTION: 0, CLEANING: 0, DAMAGED: 0, LOST: 0,
});

export interface FleetKpis {
  totalOwned: number; available: number; inCirculation: number; awaitingCollection: number;
  cleaning: number; damaged: number; lost: number;
  withCustomers: number; pendingReturn: number; depositsHeldPaise: number; utilisationPct: number;
}

// ---------------------------------------------------------------- overview
export async function bottleFleetOverview() {
  const [stock, byEvent, byDeposit] = await Promise.all([
    db.bottleStock.findMany(),
    db.bottleLedger.groupBy({ by: ["event"], _sum: { qty: true } }),
    db.bottleLedger.groupBy({ by: ["event"], _sum: { amountPaise: true } }),
  ]);

  const caps = new Map<number, Record<BottleStage, number>>();
  for (const s of stock) {
    const row = caps.get(s.capacityMl) ?? blank();
    row[s.stage as BottleStage] = s.qty;
    caps.set(s.capacityMl, row);
  }
  const sumStage = (st: BottleStage) => stock.reduce((a, s) => a + (s.stage === st ? s.qty : 0), 0);

  const evQty = (e: string) => byEvent.find((g) => g.event === e)?._sum.qty ?? 0;
  const evDep = (e: string) => byDeposit.find((g) => g.event === e)?._sum.amountPaise ?? 0;
  const pendingReturn = Math.max(0, evQty("ISSUED") - evQty("RETURNED") - evQty("LOST"));
  const depositsHeldPaise = Math.max(0, evDep("DEPOSIT_CHARGED") - evDep("DEPOSIT_REFUNDED"));

  const available = sumStage("AVAILABLE"), inCirculation = sumStage("IN_CIRCULATION"),
    awaitingCollection = sumStage("AWAITING_COLLECTION"), cleaning = sumStage("CLEANING"),
    damaged = sumStage("DAMAGED"), lost = sumStage("LOST");
  const totalOwned = available + inCirculation + awaitingCollection + cleaning + damaged;

  const kpis: FleetKpis = {
    totalOwned, available, inCirculation, awaitingCollection, cleaning, damaged, lost,
    withCustomers: pendingReturn, pendingReturn, depositsHeldPaise,
    utilisationPct: totalOwned ? Math.round(((inCirculation + awaitingCollection) / totalOwned) * 100) : 0,
  };

  const fleet = [...caps.entries()].sort((a, b) => a[0] - b[0]).map(([capacityMl, row]) => ({
    capacityMl, ...row, owned: OWNED.reduce((a, st) => a + row[st], 0),
  }));

  return {
    kpis, fleet,
    stages: STAGES.map((s) => ({ stage: s, label: STAGE_LABEL[s], tone: STAGE_TONE[s] })),
    flow: FLOW,
  };
}

// ---------------------------------------------------------------- movements list
export async function bottleMovements(q: {
  search?: string; capacityMl?: number; stage?: BottleStage; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const where: Record<string, unknown> = {};
  if (q.capacityMl) where.capacityMl = q.capacityMl;
  if (q.stage) where.OR = [{ fromStage: q.stage }, { toStage: q.stage }];
  if (q.search && q.search.trim()) {
    const s = q.search.trim();
    where.AND = [{ OR: [
      { reason: { contains: s, mode: "insensitive" } },
      { note: { contains: s, mode: "insensitive" } },
      { actorRole: { contains: s, mode: "insensitive" } },
    ] }];
  }
  const [total, rows] = await Promise.all([
    db.bottleMovement.count({ where }),
    db.bottleMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return {
    total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((m) => ({
      id: m.id, capacityMl: m.capacityMl,
      from: m.fromStage, fromLabel: m.fromStage ? STAGE_LABEL[m.fromStage as BottleStage] : "New stock",
      to: m.toStage, toLabel: STAGE_LABEL[m.toStage as BottleStage], toTone: STAGE_TONE[m.toStage as BottleStage],
      qty: m.qty, reason: m.reason, note: m.note, actorRole: m.actorRole ?? "—", ip: m.ip,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------- movement engine
export async function recordBottleMovement(
  args: { capacityMl: number; from: BottleStage | null; to: BottleStage; qty: number; reason: string; note?: string },
  actor: Actor,
) {
  const qty = Math.round(Number(args.qty));
  if (!STAGES.includes(args.to)) throw Errors.badRequest("Unknown destination stage.");
  if (args.from != null && !STAGES.includes(args.from)) throw Errors.badRequest("Unknown source stage.");
  if (args.from === args.to) throw Errors.badRequest("Source and destination stages must differ.");
  if (!Number.isFinite(qty) || qty <= 0) throw Errors.badRequest("Quantity must be a positive whole number.");
  if (!CAPACITIES.includes(args.capacityMl as (typeof CAPACITIES)[number])) throw Errors.badRequest("Capacity must be 300, 500 or 1000 ml.");
  if (!args.reason || !args.reason.trim()) throw Errors.badRequest("A reason is required for every bottle movement.");

  return db.$transaction(async (tx) => {
    if (args.from != null) {
      const src = await tx.bottleStock.findUnique({
        where: { capacityMl_stage: { capacityMl: args.capacityMl, stage: args.from } },
      });
      const cur = src?.qty ?? 0;
      if (cur < qty) throw Errors.badRequest(`Only ${cur} ${args.capacityMl} ml bottle(s) in ${STAGE_LABEL[args.from]} — cannot move ${qty}.`);
      await tx.bottleStock.update({
        where: { capacityMl_stage: { capacityMl: args.capacityMl, stage: args.from } },
        data: { qty: cur - qty },
      });
    }
    const dst = await tx.bottleStock.upsert({
      where: { capacityMl_stage: { capacityMl: args.capacityMl, stage: args.to } },
      create: { capacityMl: args.capacityMl, stage: args.to, qty },
      update: { qty: { increment: qty } },
    });
    const mv = await tx.bottleMovement.create({
      data: {
        capacityMl: args.capacityMl, fromStage: args.from, toStage: args.to, qty,
        reason: args.reason.trim(), note: args.note?.trim() || null,
        actorRole: actor.actorRole, actorId: actor.actorId, ip: actor.ip,
      },
    });
    return {
      id: mv.id, capacityMl: args.capacityMl, from: args.from, to: args.to, qty,
      toStageLabel: STAGE_LABEL[args.to], toBalance: dst.qty,
    };
  });
}
