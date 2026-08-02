/* COMPREHENSIVE E2E — FIFO Pending Allocation & Automatic Carry-Forward (live PROD DB, self-cleaning).
   Exercises the REAL settleDay + createTanker paths end-to-end. To keep the oversell from spilling
   into real inventory, every real OPEN tanker is QUARANTINED (remainingLitres → 0, invisible to the
   FIFO `remainingLitres > EPS` filter) for the duration and restored EXACTLY in finally (a recovery
   snapshot is also written to disk in case the process is killed mid-run). All test data is far-future
   dated (base + 500 days) so it never collides with real deliveries/orders.

     S1 under-consume  — sell < open stock → tanker stays OPEN, no pending row
     S2 oversell       — sell > open stock → shortfall booked as MilkPendingAllocation(PENDING),
                         drained tanker auto-closes
     S3 auto-absorb    — createTanker(next) re-settles the pending day: older lot restores + re-drains,
                         the NEW lot takes the overflow, pending → CLEARED (clearedByTankerId set)
     S4 carry-forward  — next tanker's reconciliation shows carryForwardInLitres + availableAfterCarryForward
     S5 P&L reconciles — ledger across BOTH tankers: Σ consumption == Σ sold, no double-deduction, no leftover shortfall
     INVARIANTS: per-tanker opening = consumed + remaining; no PENDING left; older tanker's own draws unchanged.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-fifo-carryforward.ts */
import { PrismaClient, type MilkTanker } from "@prisma/client";
import { writeFileSync, unlinkSync } from "fs";
import { istDayWindow, istISO } from "../lib/delivery/stats";
import { settleDay, listPendingAllocations } from "../lib/milk/settle";
import { createTanker } from "../lib/milk/tanker";
import { tankerReconciliation } from "../lib/milk/reconcile";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const stamp = Date.now();
const DAY = 86400000;
const RECOVERY = `C:\\Users\\devin\\AppData\\Local\\Temp\\claude\\C--Users-devin-OneDrive-Desktop-Doodly-Claude\\c991a164-a736-4095-b6ea-90103769989f\\scratchpad\\_cf_quarantine_${stamp}.json`;

// three consecutive future IST days + T2 procurement day, all past any real data
const isoOf = (offsetDays: number) => istISO(new Date(stamp + (500 + offsetDays) * DAY));
const T1_PROC = isoOf(0), DAY_A = isoOf(1), DAY_B = isoOf(2), T2_PROC = isoOf(3);

let bizId = "", t1 = "", t2 = "", ordA = "", ordB = "";
let quarantined: Pick<MilkTanker, "id" | "remainingLitres" | "consumedLitres" | "status" | "closedAt">[] = [];

async function quarantineRealOpenTankers() {
  quarantined = await db.milkTanker.findMany({
    where: { status: "OPEN", deletedAt: null, remainingLitres: { gt: 1e-6 } },
    select: { id: true, remainingLitres: true, consumedLitres: true, status: true, closedAt: true },
  });
  if (quarantined.length) {
    writeFileSync(RECOVERY, JSON.stringify(quarantined, null, 2));
    for (const q of quarantined) await db.milkTanker.update({ where: { id: q.id }, data: { remainingLitres: 0 } });
  }
}
async function restoreRealOpenTankers() {
  for (const q of quarantined) {
    await db.milkTanker.update({ where: { id: q.id }, data: { remainingLitres: q.remainingLitres, consumedLitres: q.consumedLitres, status: q.status, closedAt: q.closedAt } }).catch(() => {});
  }
  try { unlinkSync(RECOVERY); } catch { /* ok */ }
}

// A milk B2B order in Litres (drawn 1:1), DELIVERED with net revenue frozen on the given IST day.
async function mkOrder(tag: string, dayIso: string, litres: number) {
  const w = istDayWindow(dayIso);
  const rev = litres * 6600; // arbitrary ₹66/L net
  return (await db.businessOrder.create({
    data: {
      code: `CFO-${stamp}-${tag}`, businessId: bizId, deliveryDate: w.start, deliveredAt: new Date(w.start.getTime() + 60000), deliveryTime: "6 AM",
      subtotalPaise: rev, taxPaise: 0, totalPaise: rev, paymentTerm: "CASH", status: "DELIVERED", revenuePaise: rev,
      items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: litres, unit: "Litres", unitPricePaise: 6600, lineTotalPaise: rev }] },
    },
  })).id;
}

async function run() {
  await quarantineRealOpenTankers();

  bizId = (await db.business.create({ data: { code: `CFB-${stamp}`, name: `CF Biz ${stamp}`, type: "SWEET_SHOP", contactPerson: "T", mobile: `9${String(stamp).slice(-9)}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CASH" } })).id;

  // T1: the only open lot — 100 L @ ₹50/L, procured T1_PROC (oldest test lot).
  const w1 = istDayWindow(T1_PROC);
  t1 = (await db.milkTanker.create({ data: { code: `CFT1-${stamp}`, procurementDate: w1.start, tankerNo: `CFT1-${stamp}`, supplier: "CF SUPPLIER", quantityKg: 103, fatPct: 6, conversionFactor: 1.03, milkRatePaise: 0, fatRatePaise: 0, litres: 100, kgFat: 6, milkCostPaise: 500000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 500000, costPerLitrePaise: 5000, costPerKgPaise: 4854, remainingLitres: 100, consumedLitres: 0, status: "OPEN" } })).id;

  ordA = await mkOrder("A", DAY_A, 80);
  ordB = await mkOrder("B", DAY_B, 70);

  // ---- S1: under-consume — sell 80 of 100 → OPEN, no pending ----
  const sA = await settleDay(DAY_A, { actorRole: "system" });
  const t1AfterA = (await db.milkTanker.findUnique({ where: { id: t1 }, select: { status: true, remainingLitres: true } }))!;
  const pendA = await db.milkPendingAllocation.findUnique({ where: { date: w1_dayStart(DAY_A) } });
  ok("S1: 80 L drawn, no shortfall", near(sA.totalLitres, 80) && near(sA.shortfallLitres, 0), `drawn=${sA.totalLitres} short=${sA.shortfallLitres}`);
  ok("S1: T1 stays OPEN with 20 L left", t1AfterA.status === "OPEN" && near(t1AfterA.remainingLitres, 20), `${t1AfterA.status} ${t1AfterA.remainingLitres}L`);
  ok("S1: no pending allocation created", !pendA || pendA.status !== "PENDING", pendA ? pendA.status : "none");

  // ---- S2: oversell — sell 70 with only 20 left → shortfall 50 booked PENDING, T1 closes ----
  const sB = await settleDay(DAY_B, { actorRole: "system" });
  const t1AfterB = (await db.milkTanker.findUnique({ where: { id: t1 }, select: { status: true, remainingLitres: true, consumedLitres: true } }))!;
  const pendB = await db.milkPendingAllocation.findUnique({ where: { date: w1_dayStart(DAY_B) } });
  ok("S2: 20 L drawn, 50 L shortfall", near(sB.totalLitres, 20) && near(sB.shortfallLitres, 50), `drawn=${sB.totalLitres} short=${sB.shortfallLitres}`);
  ok("S2: T1 auto-closes at drain (100 consumed, 0 left)", t1AfterB.status === "CLOSED" && near(t1AfterB.remainingLitres, 0) && near(t1AfterB.consumedLitres, 100), `${t1AfterB.status} rem=${t1AfterB.remainingLitres} used=${t1AfterB.consumedLitres}`);
  ok("S2: MilkPendingAllocation(DAY_B) = 50 L PENDING (all B2B)", !!pendB && pendB.status === "PENDING" && near(pendB.totalLitres, 50) && near(pendB.b2bLitres, 50), pendB ? `${pendB.status} total=${pendB.totalLitres} b2b=${pendB.b2bLitres}` : "MISSING");
  ok("S2: listPendingAllocations surfaces exactly this day", (await listPendingAllocations()).filter((p) => near(p.totalLitres, 50)).length >= 1);

  // ---- S3: auto-absorb on next tanker ----
  const created = await createTanker({ procurementDate: T2_PROC, tankerNo: `CFT2-${stamp}`, supplier: "CF SUPPLIER 2", quantityKg: 206, fatPct: 6 }, { actorRole: "system" });
  t2 = created.id;
  const t2Litres = created.litres;
  const t2AfterAbsorb = (await db.milkTanker.findUnique({ where: { id: t2 }, select: { remainingLitres: true, consumedLitres: true, status: true } }))!;
  const t1AfterAbsorb = (await db.milkTanker.findUnique({ where: { id: t1 }, select: { remainingLitres: true, consumedLitres: true, status: true } }))!;
  const pendBCleared = await db.milkPendingAllocation.findUnique({ where: { date: w1_dayStart(DAY_B) } });
  ok("S3: pending DAY_B now CLEARED by the new tanker", !!pendBCleared && pendBCleared.status === "CLEARED" && pendBCleared.clearedByTankerId === t2, pendBCleared ? `${pendBCleared.status} by=${pendBCleared.clearedByTankerId === t2 ? "T2" : pendBCleared.clearedByTankerId}` : "MISSING");
  ok("S3: T2 absorbed 50 L (remaining = litres − 50)", near(t2AfterAbsorb.consumedLitres, 50) && near(t2AfterAbsorb.remainingLitres, t2Litres - 50), `used=${t2AfterAbsorb.consumedLitres} rem=${t2AfterAbsorb.remainingLitres} of ${t2Litres}`);
  ok("S3: T1 unchanged — still 100 consumed / 0 left / CLOSED (no double-draw)", near(t1AfterAbsorb.consumedLitres, 100) && near(t1AfterAbsorb.remainingLitres, 0) && t1AfterAbsorb.status === "CLOSED", `used=${t1AfterAbsorb.consumedLitres} rem=${t1AfterAbsorb.remainingLitres} ${t1AfterAbsorb.status}`);
  ok("S3: no PENDING allocations remain", (await listPendingAllocations()).length === 0, String((await listPendingAllocations()).length));

  // ---- S4: carry-forward surfaced on the next tanker's reconciliation ----
  const rc2 = (await tankerReconciliation(t2))!;
  ok("S4: T2 carryForwardInLitres = 50 (supplied a pre-arrival oversold day)", near(rc2.usage.carryForwardInLitres, 50), String(rc2.usage.carryForwardInLitres));
  ok("S4: T2 availableAfterCarryForward = litres − 50", near(rc2.usage.availableAfterCarryForward, t2Litres - 50), `${rc2.usage.availableAfterCarryForward} vs ${t2Litres - 50}`);
  ok("S4: T2 reconciles (Σ attributed == ledger)", rc2.reconciled && near(rc2.b2b.litres, 50), `rec=${rc2.reconciled} b2b=${rc2.b2b.litres}`);
  const rc1 = (await tankerReconciliation(t1))!;
  ok("S4: T1 attributes all 100 L B2B (80 + 20), carryForwardIn 0", near(rc1.b2b.litres, 100) && near(rc1.usage.carryForwardInLitres, 0) && rc1.reconciled, `b2b=${rc1.b2b.litres} cfIn=${rc1.usage.carryForwardInLitres}`);

  // ---- S5: P&L / ledger reconciles across BOTH tankers ----
  const ledgerA = await db.tankerConsumption.aggregate({ where: { date: w1_dayStart(DAY_A) }, _sum: { litres: true } });
  const ledgerB = await db.tankerConsumption.aggregate({ where: { date: w1_dayStart(DAY_B) }, _sum: { litres: true } });
  ok("S5: DAY_A ledger == 80 L sold (no shortfall)", near(ledgerA._sum.litres ?? 0, 80), String(ledgerA._sum.litres));
  ok("S5: DAY_B ledger == 70 L sold (20 T1 + 50 T2, fully costed)", near(ledgerB._sum.litres ?? 0, 70), String(ledgerB._sum.litres));
  // DAY_B COGS = 20 L × T1 ₹50 + 50 L × T2 cost — proves the carried-forward litres now carry real COGS.
  const t2Cost = (await db.milkTanker.findUnique({ where: { id: t2 }, select: { costPerLitrePaise: true } }))!.costPerLitrePaise;
  const expectB = Math.round(20 * 5000) + Math.round(50 * t2Cost);
  const cogsB = (await db.tankerConsumption.aggregate({ where: { date: w1_dayStart(DAY_B) }, _sum: { costPaise: true } }))._sum.costPaise ?? 0;
  ok("S5: DAY_B COGS = 20×₹50 + 50×T2/L (carry-forward litres costed)", Math.abs(cogsB - expectB) <= 100, `cogs=${cogsB} expect=${expectB}`);
  // INVARIANT: per-tanker opening = consumed + remaining
  const T1 = (await db.milkTanker.findUnique({ where: { id: t1 } }))!;
  const T2 = (await db.milkTanker.findUnique({ where: { id: t2 } }))!;
  ok("INV: T1 opening 100 = consumed + remaining", near(T1.litres, T1.consumedLitres + T1.remainingLitres) && near(T1.litres, 100));
  ok("INV: T2 opening = consumed + remaining", near(T2.litres, T2.consumedLitres + T2.remainingLitres));
}

// IST-midnight Date used as the MilkPendingAllocation / TankerConsumption `date` key.
function w1_dayStart(iso: string): Date { return istDayWindow(iso).start; }

async function cleanup() {
  try {
    for (const tid of [t1, t2]) if (tid) {
      await db.tankerClosingReport.deleteMany({ where: { tankerId: tid } }).catch(() => {});
      await db.tankerConsumption.deleteMany({ where: { tankerId: tid } }).catch(() => {});
      await db.milkTanker.deleteMany({ where: { id: tid } }).catch(() => {});
    }
    for (const iso of [DAY_A, DAY_B]) await db.milkPendingAllocation.deleteMany({ where: { date: w1_dayStart(iso) } }).catch(() => {});
    for (const oid of [ordA, ordB]) if (oid) await db.businessOrder.deleteMany({ where: { id: oid } }).catch(() => {});
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { OR: [{ target: { contains: `CFT1-${stamp}` } }, { target: { contains: `CFT2-${stamp}` } }, { target: { contains: `${stamp}` } }] } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await restoreRealOpenTankers();   // ALWAYS restore real inventory first
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== FIFO Pending Allocation & Carry-Forward E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
