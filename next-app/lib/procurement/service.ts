/* =============================================================
   DOODLY — Procurement service (daily milk collection)
   Reuses Procurement + Farmer + QualityTest + InventoryItem.
   No duplicate tables: batches/quality/pricing/payment all live on
   the existing Procurement + QualityTest; pricing = Farmer.ratePerLitre;
   accepted collections auto-increment the raw-milk InventoryItem
   (MILK_RAW). Settlement = Procurement.paidAt.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { approveBatch, rejectBatch } from "@/lib/quality/service";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }
export const MILK_TYPE = "A2 Buffalo";
const RAW_MILK_SKU = "MILK_RAW";

function dayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { s, e };
}

type ProcRow = {
  id: string; batchNo: string; collectedAt: Date; litres: number; fatPct: number; snfPct: number; lactometer: number | null; temperatureC: number | null;
  accepted: boolean; amountPaise: number; paidAt: Date | null;
  farmer: { id: string; name: string; village: string; route: string | null; center: string | null; ratePerLitre: number } | null;
  qualityTest: { passed: boolean } | null;
};
function mapProc(p: ProcRow) {
  const ratePaise = p.litres ? Math.round(p.amountPaise / p.litres) : (p.farmer?.ratePerLitre ?? 0);
  const quality: [string, string] = p.qualityTest ? (p.qualityTest.passed ? ["green", "Passed"] : ["red", "Failed"]) : (p.accepted ? ["amber", "Pending"] : ["red", "Rejected"]);
  return {
    id: p.id, batchNo: p.batchNo, date: p.collectedAt.toISOString().slice(0, 10), collectedAt: p.collectedAt.toISOString(),
    farmerId: p.farmer?.id ?? null, farmer: p.farmer?.name ?? "—", village: p.farmer?.village ?? "—",
    route: p.farmer?.route ?? "—", center: p.farmer?.center ?? "—", milkType: MILK_TYPE,
    litres: p.litres, fatPct: p.fatPct, snfPct: p.snfPct, temperatureC: p.temperatureC, lactometer: p.lactometer,
    ratePaise, amountPaise: p.amountPaise, accepted: p.accepted, quality, tested: !!p.qualityTest,
    paymentStatus: (p.paidAt ? ["green", "Paid"] : ["amber", "Due"]) as [string, string],
  };
}

const PROC_SELECT = {
  id: true, batchNo: true, collectedAt: true, litres: true, fatPct: true, snfPct: true, lactometer: true, temperatureC: true, accepted: true, amountPaise: true, paidAt: true,
  farmer: { select: { id: true, name: true, village: true, route: true, center: true, ratePerLitre: true } },
  qualityTest: { select: { passed: true } },
} as const;

export async function listProcurement(q: { search?: string; farmerId?: string; quality?: string; payment?: string; center?: string; route?: string; from?: string; to?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (q.farmerId) where.farmerId = q.farmerId;
  if (q.from || q.to) where.collectedAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
  const rows = await db.procurement.findMany({ where, orderBy: { collectedAt: "desc" }, take: 300, select: PROC_SELECT });
  let items = rows.map(mapProc);
  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); items = items.filter((p) => [p.id, p.batchNo, p.farmer, p.farmerId, p.center, p.route].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.center) items = items.filter((p) => p.center === q.center);
  if (q.route) items = items.filter((p) => p.route === q.route);
  if (q.quality === "passed") items = items.filter((p) => p.quality[1] === "Passed");
  else if (q.quality === "failed") items = items.filter((p) => p.quality[1] === "Failed" || p.quality[1] === "Rejected");
  else if (q.quality === "pending") items = items.filter((p) => !p.tested && p.accepted);
  if (q.payment === "paid") items = items.filter((p) => p.paymentStatus[1] === "Paid");
  else if (q.payment === "due") items = items.filter((p) => p.paymentStatus[1] === "Due");
  return { items, stats: { total: items.length, litres: +items.reduce((a, p) => a + p.litres, 0).toFixed(1), amountPaise: items.reduce((a, p) => a + p.amountPaise, 0) } };
}

export async function procurementStats() {
  const { s, e } = dayBounds();
  const since = new Date(); since.setDate(since.getDate() - 30);
  const [today, month, qts, batches, pendingQuality, pendingPay, activeFarmers] = await Promise.all([
    db.procurement.aggregate({ where: { collectedAt: { gte: s, lte: e } }, _sum: { litres: true, amountPaise: true }, _count: true }),
    db.procurement.aggregate({ where: { collectedAt: { gte: since } }, _sum: { litres: true, amountPaise: true }, _avg: { fatPct: true } }),
    db.qualityTest.findMany({ where: { testedAt: { gte: since } }, select: { passed: true } }),
    db.procurement.count(),
    db.procurement.count({ where: { qualityTest: null, accepted: true } }),
    db.procurement.aggregate({ where: { paidAt: null }, _sum: { amountPaise: true } }),
    db.procurement.findMany({ where: { collectedAt: { gte: since } }, select: { farmerId: true }, distinct: ["farmerId"] }),
  ]);
  const passed = qts.filter((q) => q.passed).length;
  const monthL = month._sum.litres ?? 0, monthAmt = month._sum.amountPaise ?? 0;
  return {
    todayLitres: +(today._sum.litres ?? 0).toFixed(1),
    todayCount: today._count,
    todayCostPaise: today._sum.amountPaise ?? 0,
    totalLitres30: +monthL.toFixed(1),
    procurementCostPaise: monthAmt,
    avgPricePaise: monthL ? Math.round(monthAmt / monthL) : 0,
    avgFatPct: +((month._avg.fatPct ?? 0)).toFixed(1),
    activeFarmers: activeFarmers.length,
    qualityPassRate: qts.length ? Math.round((passed / qts.length) * 100) : 100,
    batches,
    pendingQualityTests: pendingQuality,
    pendingPaymentsPaise: pendingPay._sum.amountPaise ?? 0,
  };
}

export async function procurementDetail(id: string) {
  const p = await db.procurement.findUnique({
    where: { id },
    select: {
      ...PROC_SELECT,
      qualityTest: { select: { passed: true, fatPct: true, snfPct: true, lactometer: true, temperatureC: true, rejectReason: true, testedAt: true } },
    },
  });
  if (!p) throw Errors.notFound("Procurement record not found.");
  const base = mapProc({ ...p, qualityTest: p.qualityTest ? { passed: p.qualityTest.passed } : null });
  return {
    ...base,
    farmerPhone: undefined,
    quality: base.quality,
    qualityTest: p.qualityTest ? { ...p.qualityTest, testedAt: p.qualityTest.testedAt.toISOString() } : null,
    pricing: { ratePaise: base.ratePaise, litres: p.litres, amountPaise: p.amountPaise },
  };
}

function genBatchNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `PB-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function createProcurement(input: {
  farmerId: string; collectedAt?: string; litres: number; fatPct: number; snfPct: number; lactometer?: number; temperatureC?: number; batchNo?: string; accepted?: boolean;
}, _actor: Actor) {
  const farmer = await db.farmer.findUnique({ where: { id: input.farmerId }, select: { id: true, ratePerLitre: true } });
  if (!farmer) throw Errors.badRequest("That farmer does not exist.");
  if (!(input.litres > 0)) throw Errors.badRequest("Quantity (litres) must be positive.");

  // auto-generate a unique batch number if none supplied
  let batchNo = input.batchNo?.trim();
  if (!batchNo) {
    for (let i = 0; i < 6 && !batchNo; i++) { const cand = genBatchNo(); if (!(await db.procurement.findUnique({ where: { batchNo: cand }, select: { id: true } }))) batchNo = cand; }
    if (!batchNo) throw Errors.badRequest("Could not generate a batch number — retry.");
  } else if (await db.procurement.findUnique({ where: { batchNo }, select: { id: true } })) {
    throw Errors.conflict("That batch number already exists.");
  }

  const accepted = input.accepted ?? true;
  const amountPaise = Math.round(farmer.ratePerLitre * input.litres);

  const created = await db.$transaction(async (tx) => {
    const p = await tx.procurement.create({
      data: {
        farmerId: input.farmerId, collectedAt: input.collectedAt ? new Date(input.collectedAt) : new Date(),
        litres: input.litres, fatPct: input.fatPct, snfPct: input.snfPct, lactometer: input.lactometer ?? null, temperatureC: input.temperatureC ?? null,
        batchNo: batchNo!, accepted, amountPaise,
      },
      select: PROC_SELECT,
    });
    // inventory integration: accepted collection increases raw-milk stock
    if (accepted) {
      const raw = await tx.inventoryItem.findFirst({ where: { sku: RAW_MILK_SKU }, select: { id: true } });
      if (raw) await tx.inventoryItem.update({ where: { id: raw.id }, data: { quantity: { increment: input.litres } } });
    }
    return p;
  });
  return mapProc(created);
}

export type ProcBulkAction = "accept" | "reject" | "markPaid" | "markDue";
export async function bulkProcurement(args: { action: ProcBulkAction; ids: string[] }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one record.");
  // Accept/reject MUST go through setAccepted() (quality service): it is idempotent and moves
  // the MILK_RAW InventoryItem by ±litres in a transaction. Flipping `accepted` with a bare
  // updateMany left raw-milk stock desynced forever (a rejected 200 L batch kept its 200 L on
  // hand) and could even double-count it if the batch was later re-approved from Quality.
  if (args.action === "accept" || args.action === "reject") {
    const fn = args.action === "accept" ? approveBatch : rejectBatch;
    let count = 0;
    for (const id of ids) { await fn(id, _actor); count++; }
    return { action: args.action, count };
  }
  let data: Record<string, unknown>;
  switch (args.action) {
    case "markPaid": data = { paidAt: new Date() }; break;
    case "markDue": data = { paidAt: null }; break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  const res = await db.procurement.updateMany({ where: { id: { in: ids } }, data });
  return { action: args.action, count: res.count };
}
