/* =============================================================
   DOODLY — Farmers (milk suppliers) service
   Reuses Farmer + Procurement (collection + payment) + QualityTest.
   No duplicate tables: collection history / quality / payments all
   derive from the existing Procurement + QualityTest records; farmer
   pricing is Farmer.ratePerLitre; settlement is Procurement.paidAt.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }
export const MILK_TYPE = "A2 Buffalo";

type FarmerRow = {
  id: string; name: string; owner: string | null; phone: string; altPhone: string | null; village: string;
  mandal: string | null; district: string | null; state: string | null; pincode: string | null; route: string | null; center: string | null;
  ratePerLitre: number; notes: string | null; active: boolean; deletedAt: Date | null; createdAt: Date; updatedAt: Date;
};
function mapFarmer(f: FarmerRow, agg: { dailySupply: number; count: number; qualityStatus: [string, string]; paymentStatus: [string, string]; pendingPaise: number; avgFat?: number }) {
  return {
    id: f.id, name: f.name, owner: f.owner ?? "—", phone: f.phone, altPhone: f.altPhone ?? "", village: f.village,
    mandal: f.mandal ?? "", district: f.district ?? "—", state: f.state ?? "—", pincode: f.pincode ?? "", route: f.route ?? "—", center: f.center ?? "—",
    milkType: MILK_TYPE, ratePerLitre: f.ratePerLitre, notes: f.notes, active: f.active, deleted: !!f.deletedAt,
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
    dailySupply: agg.dailySupply, avgFat: agg.avgFat ?? 0, procurements: agg.count, qualityStatus: agg.qualityStatus, paymentStatus: agg.paymentStatus, pendingPaise: agg.pendingPaise,
    status: (f.deletedAt ? ["grey", "Deleted"] : f.active ? ["green", "Active"] : ["grey", "Inactive"]) as [string, string],
  };
}

export async function listFarmers(q: { search?: string; status?: string; route?: string; district?: string; payment?: string; quality?: string } = {}) {
  const rows = await db.farmer.findMany({ where: q.status === "deleted" ? { NOT: { deletedAt: null } } : { deletedAt: null }, orderBy: { name: "asc" } });
  const ids = rows.map((f) => f.id);
  const since = new Date(); since.setDate(since.getDate() - 30);
  const procs = ids.length ? await db.procurement.findMany({ where: { farmerId: { in: ids } }, select: { farmerId: true, litres: true, fatPct: true, collectedAt: true, amountPaise: true, paidAt: true, qualityTest: { select: { passed: true } } } }) : [];

  const agg = new Map<string, { litres30: number; count: number; pendingPaise: number; fatSum: number; lastAt: Date | null; lastPass: boolean | null }>();
  for (const f of rows) agg.set(f.id, { litres30: 0, count: 0, pendingPaise: 0, fatSum: 0, lastAt: null, lastPass: null });
  for (const p of procs) {
    const a = agg.get(p.farmerId); if (!a) continue;
    a.count++; a.fatSum += p.fatPct;
    if (p.collectedAt >= since) a.litres30 += p.litres;
    if (!p.paidAt) a.pendingPaise += p.amountPaise;
    if (!a.lastAt || p.collectedAt > a.lastAt) { a.lastAt = p.collectedAt; a.lastPass = p.qualityTest?.passed ?? null; }
  }

  let items = rows.map((f) => {
    const a = agg.get(f.id)!;
    const dailySupply = a.litres30 ? +(a.litres30 / 30).toFixed(1) : 0;
    const avgFat = a.count ? +(a.fatSum / a.count).toFixed(1) : 0;
    const qualityStatus: [string, string] = a.lastPass == null ? ["grey", "—"] : a.lastPass ? ["green", "Pass"] : ["red", "Fail"];
    const paymentStatus: [string, string] = a.pendingPaise > 0 ? ["amber", "Due"] : ["green", "Settled"];
    return mapFarmer(f, { dailySupply, avgFat, count: a.count, qualityStatus, paymentStatus, pendingPaise: a.pendingPaise });
  });

  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); items = items.filter((f) => [f.id, f.name, f.owner, f.phone, f.village, f.route, f.district].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.route) items = items.filter((f) => f.route === q.route);
  if (q.district) items = items.filter((f) => f.district === q.district);
  if (q.status === "active") items = items.filter((f) => f.active);
  else if (q.status === "inactive") items = items.filter((f) => !f.active);
  if (q.payment === "due") items = items.filter((f) => f.pendingPaise > 0);
  else if (q.payment === "settled") items = items.filter((f) => f.pendingPaise === 0);
  if (q.quality === "pass") items = items.filter((f) => f.qualityStatus[1] === "Pass");
  else if (q.quality === "fail") items = items.filter((f) => f.qualityStatus[1] === "Fail");

  return { items, stats: statsFrom(items) };
}

function statsFrom(items: { active: boolean }[]) {
  return { total: items.length, active: items.filter((f) => f.active).length, inactive: items.filter((f) => !f.active).length };
}

export async function farmerStats() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  const since = new Date(); since.setDate(since.getDate() - 30);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [farmers, todayProcs, monthProcs, qts, pending] = await Promise.all([
    db.farmer.findMany({ where: { deletedAt: null }, select: { active: true, createdAt: true } }),
    db.procurement.aggregate({ where: { collectedAt: { gte: s, lte: e } }, _sum: { litres: true, amountPaise: true } }),
    db.procurement.aggregate({ where: { collectedAt: { gte: since } }, _sum: { litres: true, amountPaise: true } }),
    db.qualityTest.findMany({ where: { testedAt: { gte: since } }, select: { passed: true } }),
    db.procurement.aggregate({ where: { paidAt: null }, _sum: { amountPaise: true } }),
  ]);
  const passed = qts.filter((q) => q.passed).length;
  return {
    total: farmers.length,
    active: farmers.filter((f) => f.active).length,
    inactive: farmers.filter((f) => !f.active).length,
    newThisMonth: farmers.filter((f) => f.createdAt >= monthStart).length,
    milkTodayL: +(todayProcs._sum.litres ?? 0).toFixed(1),
    avgDailyL: +((monthProcs._sum.litres ?? 0) / 30).toFixed(1),
    qualityPassRate: qts.length ? Math.round((passed / qts.length) * 100) : 100,
    procurementCostPaise: monthProcs._sum.amountPaise ?? 0,
    pendingPaise: pending._sum.amountPaise ?? 0,
  };
}

export async function farmerDetail(id: string) {
  const f = await db.farmer.findUnique({ where: { id } });
  if (!f) throw Errors.notFound("Farmer not found.");
  const procs = await db.procurement.findMany({
    where: { farmerId: id }, orderBy: { collectedAt: "desc" }, take: 60,
    select: { id: true, collectedAt: true, litres: true, fatPct: true, snfPct: true, lactometer: true, temperatureC: true, batchNo: true, accepted: true, amountPaise: true, paidAt: true, qualityTest: { select: { passed: true, rejectReason: true } } },
  });
  // Money + volume must span EVERY collection, not just the 60 shown. The list view and
  // settleFarmer() both work over all rows, so the detail page was showing a smaller "pending"
  // than the Settle button actually pays out — the operator approved a number they never saw.
  const [allAgg, unpaidAgg, paidAgg] = await Promise.all([
    db.procurement.aggregate({ where: { farmerId: id }, _sum: { litres: true }, _avg: { fatPct: true, snfPct: true } }),
    db.procurement.aggregate({ where: { farmerId: id, paidAt: null }, _sum: { amountPaise: true } }),
    db.procurement.aggregate({ where: { farmerId: id, paidAt: { not: null } }, _sum: { amountPaise: true } }),
  ]);
  const totalLitres = allAgg._sum.litres ?? 0;
  const avg = (k: "fatPct" | "snfPct") => +((k === "fatPct" ? allAgg._avg.fatPct : allAgg._avg.snfPct) ?? 0).toFixed(2);
  const collections = procs.map((p) => ({
    id: p.id, date: p.collectedAt.toISOString().slice(0, 10), litres: p.litres, fatPct: p.fatPct, snfPct: p.snfPct,
    lactometer: p.lactometer, temperatureC: p.temperatureC, batchNo: p.batchNo, accepted: p.accepted, amountPaise: p.amountPaise,
    paid: !!p.paidAt, quality: p.qualityTest ? (p.qualityTest.passed ? "Pass" : "Fail") : "—",
  }));
  const pendingPaise = unpaidAgg._sum.amountPaise ?? 0;
  const paidPaise = paidAgg._sum.amountPaise ?? 0;
  return {
    id: f.id, name: f.name, owner: f.owner, phone: f.phone, altPhone: f.altPhone, village: f.village, mandal: f.mandal,
    district: f.district, state: f.state, pincode: f.pincode, route: f.route, center: f.center, milkType: MILK_TYPE,
    ratePerLitre: f.ratePerLitre, notes: f.notes, active: f.active, deleted: !!f.deletedAt, createdAt: f.createdAt.toISOString(),
    collections, avgFatPct: avg("fatPct"), avgSnfPct: avg("snfPct"), totalLitres: +totalLitres.toFixed(1),
    pendingPaise, paidPaise, totalProcurements: procs.length,
  };
}

const FIELDS = ["name", "owner", "phone", "altPhone", "village", "mandal", "district", "state", "pincode", "route", "center", "notes"] as const;
export async function createFarmer(input: Record<string, unknown>, _actor: Actor) {
  if (!String(input.name ?? "").trim()) throw Errors.badRequest("Farmer name is required.");
  if (!/^[+]?[0-9\s-]{7,15}$/.test(String(input.phone ?? ""))) throw Errors.badRequest("Enter a valid phone number.");
  if (!String(input.village ?? "").trim()) throw Errors.badRequest("Village is required.");
  const dupe = await db.farmer.findFirst({ where: { phone: String(input.phone).trim(), deletedAt: null }, select: { id: true } });
  if (dupe) throw Errors.conflict("A farmer with this phone number already exists.");
  const data: Record<string, unknown> = { ratePerLitre: Math.max(0, Math.round(Number(input.ratePerLitre) || 0)) };
  for (const k of FIELDS) if (input[k] != null) data[k] = String(input[k]).trim() || null;
  data.name = String(input.name).trim();
  const f = await db.farmer.create({ data: data as never });
  return mapFarmer(f as FarmerRow, { dailySupply: 0, count: 0, qualityStatus: ["grey", "—"], paymentStatus: ["green", "Settled"], pendingPaise: 0 });
}

export async function updateFarmer(id: string, patch: Record<string, unknown>, _actor: Actor) {
  const cur = await db.farmer.findUnique({ where: { id }, select: { id: true } });
  if (!cur) throw Errors.notFound("Farmer not found.");
  const data: Record<string, unknown> = {};
  for (const k of FIELDS) if (patch[k] !== undefined) data[k] = patch[k] ? String(patch[k]).trim() : (k === "name" || k === "phone" || k === "village" ? undefined : null);
  if (patch.name != null && !String(patch.name).trim()) throw Errors.badRequest("Name cannot be empty.");
  if (patch.ratePerLitre != null) data.ratePerLitre = Math.max(0, Math.round(Number(patch.ratePerLitre)));
  if (patch.active != null) data.active = !!patch.active;
  if (patch.deleted != null) data.deletedAt = patch.deleted ? new Date() : null;
  await db.farmer.update({ where: { id }, data });
  return { id };
}

/** Record settlement: mark all of a farmer's due collections as paid. */
export async function settleFarmer(id: string, _actor: Actor) {
  const cur = await db.farmer.findUnique({ where: { id }, select: { id: true } });
  if (!cur) throw Errors.notFound("Farmer not found.");
  const due = await db.procurement.aggregate({ where: { farmerId: id, paidAt: null }, _sum: { amountPaise: true }, _count: true });
  if (!due._count) throw Errors.badRequest("No pending payments to settle.");
  await db.procurement.updateMany({ where: { farmerId: id, paidAt: null }, data: { paidAt: new Date() } });
  return { id, settledCount: due._count, settledPaise: due._sum.amountPaise ?? 0 };
}

export type FarmerBulkAction = "activate" | "deactivate" | "assignRoute" | "delete" | "restore";
export async function bulkFarmers(args: { action: FarmerBulkAction; ids: string[]; route?: string | null }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one farmer.");
  let data: Record<string, unknown>;
  switch (args.action) {
    case "activate": data = { active: true }; break;
    case "deactivate": data = { active: false }; break;
    case "assignRoute": data = { route: args.route || null }; break;
    case "delete": data = { deletedAt: new Date(), active: false }; break;
    case "restore": data = { deletedAt: null, active: true }; break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  const res = await db.farmer.updateMany({ where: { id: { in: ids } }, data });
  return { action: args.action, count: res.count };
}
