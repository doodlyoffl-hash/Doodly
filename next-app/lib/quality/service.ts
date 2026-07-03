/* =============================================================
   DOODLY — Quality Testing service
   Reuses QualityTest + Procurement + Farmer + InventoryItem.
   No duplicate tables: a "quality record" is a Procurement (the batch)
   with an optional QualityTest. Configurable rules live on the new
   QualityConfig singleton. Batch approval flips Procurement.accepted
   and keeps the raw-milk (MILK_RAW) inventory in sync.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }
const RAW_MILK_SKU = "MILK_RAW";
const ID = "singleton";

export async function getQualityConfig() {
  const c = await db.qualityConfig.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
  return { ...c, updatedAt: c.updatedAt.toISOString() };
}

const TRACKED = ["minFatPct", "minSnfPct", "tempMinC", "tempMaxC", "densityMin", "densityMax"] as const;
export async function updateQualityConfig(patch: Record<string, unknown>, actor: Actor) {
  const cur = await db.qualityConfig.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
  const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v)));
  const data: Record<string, unknown> = {};
  if (patch.minFatPct != null) data.minFatPct = clamp(patch.minFatPct, 0, 20);
  if (patch.minSnfPct != null) data.minSnfPct = clamp(patch.minSnfPct, 0, 20);
  if (patch.tempMinC != null) data.tempMinC = clamp(patch.tempMinC, -5, 30);
  if (patch.tempMaxC != null) data.tempMaxC = clamp(patch.tempMaxC, -5, 40);
  if (patch.densityMin != null) data.densityMin = clamp(patch.densityMin, 0, 50);
  if (patch.densityMax != null) data.densityMax = clamp(patch.densityMax, 0, 50);
  data.updatedBy = actor.actorRole ?? null;
  const next = await db.qualityConfig.update({ where: { id: ID }, data });
  const changes = TRACKED.filter((f) => (cur as Record<string, unknown>)[f] !== (next as Record<string, unknown>)[f]).map((f) => ({ field: f, from: (cur as Record<string, unknown>)[f], to: (next as Record<string, unknown>)[f] }));
  return { config: { ...next, updatedAt: next.updatedAt.toISOString() }, changes };
}

type Cfg = { minFatPct: number; minSnfPct: number; tempMinC: number; tempMaxC: number; densityMin: number; densityMax: number };
function gradeOf(fat: number, snf: number, cfg: Cfg): string {
  if (fat < cfg.minFatPct || snf < cfg.minSnfPct) return "C";
  if (fat >= cfg.minFatPct + 1.5 && snf >= cfg.minSnfPct + 0.5) return "A";
  return "B";
}

type ProcRow = {
  id: string; batchNo: string; collectedAt: Date; litres: number; fatPct: number; snfPct: number; lactometer: number | null; temperatureC: number | null; accepted: boolean; farmerId: string;
  farmer: { name: string; village: string; center: string | null } | null;
  qualityTest: { id: string; fatPct: number; snfPct: number; lactometer: number; temperatureC: number; passed: boolean; rejectReason: string | null; testedAt: Date } | null;
};
function mapQuality(p: ProcRow, cfg: Cfg) {
  const qt = p.qualityTest;
  const fat = qt?.fatPct ?? p.fatPct, snf = qt?.snfPct ?? p.snfPct, density = qt?.lactometer ?? p.lactometer, temp = qt?.temperatureC ?? p.temperatureC;
  const status: [string, string] = qt ? (qt.passed ? ["green", "Passed"] : ["red", "Failed"]) : (p.accepted ? ["amber", "Pending"] : ["grey", "Rejected"]);
  return {
    testId: qt?.id ?? null, procurementId: p.id, batchNo: p.batchNo, farmerId: p.farmerId, farmer: p.farmer?.name ?? "—", center: p.farmer?.center ?? "—", village: p.farmer?.village ?? "—",
    collectedAt: p.collectedAt.toISOString(), collectionDate: p.collectedAt.toISOString().slice(0, 10),
    testedAt: qt?.testedAt.toISOString() ?? null, testDate: qt ? qt.testedAt.toISOString().slice(0, 10) : "—",
    litres: p.litres, fatPct: fat, snfPct: snf, density, temperatureC: temp, grade: gradeOf(fat, snf, cfg),
    passed: qt?.passed ?? null, tested: !!qt, accepted: p.accepted, rejectReason: qt?.rejectReason ?? null, status,
  };
}

const PROC_SELECT = {
  id: true, batchNo: true, collectedAt: true, litres: true, fatPct: true, snfPct: true, lactometer: true, temperatureC: true, accepted: true, farmerId: true,
  farmer: { select: { name: true, village: true, center: true } },
  qualityTest: { select: { id: true, fatPct: true, snfPct: true, lactometer: true, temperatureC: true, passed: true, rejectReason: true, testedAt: true } },
} as const;

export async function listQuality(q: { search?: string; status?: string; farmerId?: string; center?: string; from?: string; to?: string } = {}) {
  const cfg = await getQualityConfig();
  const where: Record<string, unknown> = {};
  if (q.farmerId) where.farmerId = q.farmerId;
  if (q.from || q.to) where.collectedAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
  const rows = await db.procurement.findMany({ where, orderBy: { collectedAt: "desc" }, take: 300, select: PROC_SELECT });
  let items = rows.map((p) => mapQuality(p, cfg));
  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); items = items.filter((r) => [r.testId, r.procurementId, r.batchNo, r.farmerId, r.farmer, r.center].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.center) items = items.filter((r) => r.center === q.center);
  if (q.status === "passed") items = items.filter((r) => r.status[1] === "Passed");
  else if (q.status === "failed") items = items.filter((r) => r.status[1] === "Failed" || r.status[1] === "Rejected");
  else if (q.status === "pending") items = items.filter((r) => r.status[1] === "Pending");
  return { items, stats: statsFrom(items), config: cfg };
}

function statsFrom(items: { tested: boolean; passed: boolean | null; status: [string, string] }[]) {
  return { total: items.length, passed: items.filter((r) => r.status[1] === "Passed").length, failed: items.filter((r) => r.status[1] === "Failed").length, pending: items.filter((r) => r.status[1] === "Pending").length };
}

export async function qualityStats() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  const since = new Date(); since.setDate(since.getDate() - 30);
  const [todayTests, monthTests, pending, approved, rejected] = await Promise.all([
    db.qualityTest.findMany({ where: { testedAt: { gte: s, lte: e } }, select: { passed: true } }),
    db.qualityTest.aggregate({ where: { testedAt: { gte: since } }, _avg: { fatPct: true, snfPct: true, temperatureC: true }, _count: true }),
    db.procurement.count({ where: { qualityTest: null, accepted: true } }),
    db.procurement.count({ where: { accepted: true } }),
    db.procurement.count({ where: { accepted: false } }),
  ]);
  const passedToday = todayTests.filter((t) => t.passed).length;
  const monthPassed = await db.qualityTest.count({ where: { testedAt: { gte: since }, passed: true } });
  return {
    testedToday: todayTests.length,
    passedToday, failedToday: todayTests.length - passedToday,
    pendingTests: pending,
    avgFatPct: +((monthTests._avg.fatPct ?? 0)).toFixed(1),
    avgSnfPct: +((monthTests._avg.snfPct ?? 0)).toFixed(1),
    avgTempC: +((monthTests._avg.temperatureC ?? 0)).toFixed(1),
    approvedBatches: approved,
    rejectedBatches: rejected,
    complianceRate: monthTests._count ? Math.round((monthPassed / monthTests._count) * 100) : 100,
  };
}

export async function qualityDetail(procurementId: string) {
  const cfg = await getQualityConfig();
  const p = await db.procurement.findUnique({ where: { id: procurementId }, select: PROC_SELECT });
  if (!p) throw Errors.notFound("Quality record not found.");
  const base = mapQuality(p, cfg);
  // farmer's other tested batches (quality history)
  const history = await db.procurement.findMany({
    where: { farmerId: p.farmerId, NOT: { id: procurementId }, qualityTest: { isNot: null } },
    orderBy: { collectedAt: "desc" }, take: 10,
    select: { batchNo: true, collectedAt: true, qualityTest: { select: { passed: true, fatPct: true, snfPct: true } } },
  });
  return {
    ...base,
    inventoryImpact: base.accepted ? "In raw-milk inventory" : "Excluded from inventory",
    history: history.map((h) => ({ batchNo: h.batchNo, date: h.collectedAt.toISOString().slice(0, 10), passed: h.qualityTest?.passed ?? null, fatPct: h.qualityTest?.fatPct, snfPct: h.qualityTest?.snfPct })),
  };
}

// --- batch approval workflow (keeps raw-milk inventory in sync) ---
async function setAccepted(procurementId: string, accepted: boolean) {
  const p = await db.procurement.findUnique({ where: { id: procurementId }, select: { id: true, accepted: true, litres: true } });
  if (!p) throw Errors.notFound("Batch not found.");
  if (p.accepted === accepted) return { id: procurementId, accepted, inventoryDelta: 0 };
  const delta = accepted ? p.litres : -p.litres;
  await db.$transaction(async (tx) => {
    await tx.procurement.update({ where: { id: procurementId }, data: { accepted } });
    const raw = await tx.inventoryItem.findFirst({ where: { sku: RAW_MILK_SKU }, select: { id: true } });
    if (raw) await tx.inventoryItem.update({ where: { id: raw.id }, data: { quantity: { increment: delta } } });
  });
  return { id: procurementId, accepted, inventoryDelta: delta };
}
export const approveBatch = (procurementId: string, _actor: Actor) => setAccepted(procurementId, true);
export const rejectBatch = (procurementId: string, _actor: Actor) => setAccepted(procurementId, false);

export async function bulkQuality(args: { action: "approve" | "reject"; ids: string[] }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one batch.");
  let count = 0;
  for (const id of ids) { try { await setAccepted(id, args.action === "approve"); count++; } catch { /* skip missing */ } }
  return { action: args.action, count };
}
