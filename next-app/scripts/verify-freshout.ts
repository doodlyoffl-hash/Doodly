/* Runtime E2E — Freshout Milk Management (throwaway local Postgres, zero prod contact).
   Drives the spec's exact scenario end-to-end through the REAL settleDay / addFreshout /
   createTanker / reconcile paths:

     S1  Tanker 01 opening 1920 L → sell 1920 L → drained + auto-closed.
         Freshout +40 kg → +40 L: SAME lot re-opens, remaining 40, cost/L DILUTES
         (9,600,000 / 1960), and the already-consumed day's FROZEN COGS refreshes.
     S2  Sell 30 L → drawn from the freshout capacity → remaining 10 L.
     S3  Sell 25 L → 10 L drawn, 15 L shortfall → Pending Allocation 15 L.
         Next tanker absorbs ONLY the 15 L (not the original 55) — freshout came first.
     S4  Closing report shows Freshout separately; COGS integrity (total tanker COGS =
         procurement cost, no new cost); deliveries stay linked to the SAME tanker.

   Run: node scripts/_devverify.mjs scripts/verify-freshout.ts */
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";
import { settleDay, listPendingAllocations } from "@/lib/milk/settle";
import { addFreshout, createTanker } from "@/lib/milk/tanker";
import { tankerReconciliation } from "@/lib/milk/reconcile";
import { getTankerReport } from "@/lib/milk/tanker-report";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const rnd = () => Math.random().toString(36).slice(2, 8);
const DAY = 86400000;
// Fixed base (Date.now() is unavailable in workflow scripts, but this is a plain tsx run) — far future so it never collides.
const base = 4102444800000; // 2100-01-01
const isoOf = (o: number) => istISO(new Date(base + o * DAY));
const T1_PROC = isoOf(0), DAY_A = isoOf(1), DAY_B = isoOf(2), DAY_C = isoOf(3), T2_PROC = isoOf(4);
const dayStart = (iso: string) => istDayWindow(iso).start;

let bizId = "", t1 = "";

async function mkOrder(tag: string, dayIso: string, litres: number) {
  const w = istDayWindow(dayIso);
  const rev = Math.round(litres * 6600);
  return (await db.businessOrder.create({
    data: {
      code: `FRO-${tag}-${rnd()}`, businessId: bizId, deliveryDate: w.start, deliveredAt: new Date(w.start.getTime() + 60000), deliveryTime: "6 AM",
      subtotalPaise: rev, taxPaise: 0, totalPaise: rev, paymentTerm: "CASH", status: "DELIVERED", revenuePaise: rev,
      items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: litres, unit: "Litres", unitPricePaise: 6600, lineTotalPaise: rev }] },
    }, select: { id: true },
  })).id;
}
const tankerNow = (id: string) => db.milkTanker.findUnique({ where: { id }, select: { status: true, remainingLitres: true, consumedLitres: true, freshoutKg: true, freshoutLitres: true, litres: true, costPerLitrePaise: true, totalCostPaise: true } });
const dayCogs = async (iso: string) => (await db.tankerConsumption.aggregate({ where: { date: dayStart(iso) }, _sum: { costPaise: true, litres: true } }))._sum;

async function run() {
  bizId = (await db.business.create({ data: { code: `FRB-${rnd()}`, name: "Freshout Biz", type: "SWEET_SHOP", contactPerson: "T", mobile: "9876500000", line1: "1 Rd", pincode: "520001", paymentTerm: "CASH" } })).id;

  // Tanker 01 — opening 1920 L @ ₹50/L (conversionFactor 1.0 so KG==L, matching the spec numbers).
  const w1 = istDayWindow(T1_PROC);
  t1 = (await db.milkTanker.create({ data: { code: `FRT1-${rnd()}`, procurementDate: w1.start, tankerNo: "FRT1", supplier: "FR SUPPLIER", quantityKg: 1920, fatPct: 0, conversionFactor: 1.0, milkRatePaise: 5000, fatRatePaise: 0, litres: 1920, kgFat: 0, milkCostPaise: 9600000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 9600000, costPerLitrePaise: 5000, costPerKgPaise: 5000, remainingLitres: 1920, consumedLitres: 0, status: "OPEN" } })).id;

  // ---- S1: consume the full 1920 L, then add 40 kg Freshout ----
  await mkOrder("A", DAY_A, 1920);
  await settleDay(DAY_A, { actorRole: "system" });
  const afterA = (await tankerNow(t1))!;
  ok("S1: 1920 L consumed → tanker drained + auto-closed", afterA.status === "CLOSED" && near(afterA.remainingLitres, 0) && near(afterA.consumedLitres, 1920), `${afterA.status} rem=${afterA.remainingLitres} used=${afterA.consumedLitres}`);
  const cogsA0 = await dayCogs(DAY_A);
  ok("S1: pre-freshout DAY_A COGS = 1920 × ₹50 = ₹96,000 (full procurement)", near((cogsA0.costPaise ?? 0), 9600000, 100), String(cogsA0.costPaise));

  const fres = await addFreshout(t1, { quantityKg: 40, remarks: "Outlet residue" }, { actorRole: "system" });
  const afterF = (await tankerNow(t1))!;
  ok("S1: freshout re-opens the SAME tanker with 40 L available", afterF.status === "OPEN" && near(afterF.remainingLitres, 40) && near(afterF.freshoutLitres, 40) && near(afterF.freshoutKg, 40), `${afterF.status} rem=${afterF.remainingLitres} fL=${afterF.freshoutLitres}`);
  ok("S1: cost/L DILUTES to ₹96,000 / 1960 ≈ 4898p (same total cost, more litres)", afterF.costPerLitrePaise === Math.round(9600000 / 1960), `${afterF.costPerLitrePaise} vs ${Math.round(9600000 / 1960)}`);
  ok("S1: NO new procurement cost — totalCostPaise unchanged (₹96,000)", afterF.totalCostPaise === 9600000, String(afterF.totalCostPaise));
  const freshRow = await db.milkTankerFreshout.findFirst({ where: { tankerId: t1 } });
  ok("S1: a MilkTankerFreshout entry is recorded (40 kg → 40 L)", !!freshRow && near(freshRow!.quantityKg, 40) && near(freshRow!.litres, 40), freshRow ? `${freshRow.quantityKg}kg/${freshRow.litres}L` : "MISSING");
  const cogsA1 = await dayCogs(DAY_A);
  ok("S1: DAY_A frozen COGS REFRESHED at the diluted rate (1920 × 4898p)", near((cogsA1.costPaise ?? 0), 1920 * Math.round(9600000 / 1960), 100), `${cogsA1.costPaise} vs ${1920 * Math.round(9600000 / 1960)}`);
  const audited = await db.auditLog.count({ where: { action: "milk.freshout.added" } });
  ok("S1: audit trail records milk.freshout.added", audited >= 1, String(audited));

  // ---- S2: sell 30 L from the freshout capacity ----
  await mkOrder("B", DAY_B, 30);
  const sB = await settleDay(DAY_B, { actorRole: "system" });
  const afterB = (await tankerNow(t1))!;
  ok("S2: 30 L drawn from freshout → remaining 10 L, no shortfall", near(sB.totalLitres, 30) && near(sB.shortfallLitres, 0) && near(afterB.remainingLitres, 10), `drawn=${sB.totalLitres} short=${sB.shortfallLitres} rem=${afterB.remainingLitres}`);

  // ---- S3: sell 25 L → 10 drawn + 15 pending; next tanker absorbs ONLY 15 ----
  await mkOrder("C", DAY_C, 25);
  const sC = await settleDay(DAY_C, { actorRole: "system" });
  const afterC = (await tankerNow(t1))!;
  const pendC = await db.milkPendingAllocation.findUnique({ where: { date: dayStart(DAY_C) } });
  ok("S3: 10 L drawn, 15 L shortfall → tanker drained again", near(sC.totalLitres, 10) && near(sC.shortfallLitres, 15) && near(afterC.remainingLitres, 0), `drawn=${sC.totalLitres} short=${sC.shortfallLitres}`);
  ok("S3: Pending Allocation = 15 L (only the true overflow, freshout already used)", !!pendC && pendC!.status === "PENDING" && near(pendC!.totalLitres, 15), pendC ? `${pendC.status} ${pendC.totalLitres}L` : "MISSING");

  const t2c = await createTanker({ procurementDate: T2_PROC, tankerNo: "FRT2", supplier: "FR SUPPLIER 2", quantityKg: 500, fatPct: 0 }, { actorRole: "system" });
  const t2 = t2c.id;
  const t2After = (await tankerNow(t2))!;
  const pendCCleared = await db.milkPendingAllocation.findUnique({ where: { date: dayStart(DAY_C) } });
  ok("S3: next tanker absorbs ONLY 15 L (not the original 55)", near(t2After.consumedLitres, 15) && near(t2After.remainingLitres, t2c.litres - 15), `used=${t2After.consumedLitres} rem=${t2After.remainingLitres}`);
  ok("S3: pending DAY_C CLEARED by the next tanker", !!pendCCleared && pendCCleared!.status === "CLEARED" && pendCCleared!.clearedByTankerId === t2, pendCCleared ? pendCCleared.status : "MISSING");
  ok("S3: no PENDING allocations remain", (await listPendingAllocations()).length === 0);

  // ---- S4: closing report + reconciliation + integrity ----
  const rep = (await getTankerReport(t1))!;
  const u = rep.recon.usage;
  ok("S4: closing report shows Freshout separately (opening 1920 + freshout 40 = 1960 available)", near(u.openingLitres, 1920) && near(u.freshoutLitres, 40) && near(u.totalAvailableLitres, 1960), `open=${u.openingLitres} fresh=${u.freshoutLitres} avail=${u.totalAvailableLitres}`);
  const rc1 = (await tankerReconciliation(t1))!;
  ok("S4: deliveries stay linked to the SAME tanker — T1 attributes all 1960 L (1920+30+10)", near(rc1.b2b.litres, 1960) && rc1.reconciled, `b2b=${rc1.b2b.litres} rec=${rc1.reconciled}`);
  const rc2 = (await tankerReconciliation(t2))!;
  ok("S4: next tanker holds ONLY the 15 L overflow (carry-forward in)", near(rc2.b2b.litres, 15) && near(rc2.usage.carryForwardInLitres, 15), `b2b=${rc2.b2b.litres} cfIn=${rc2.usage.carryForwardInLitres}`);
  // COGS INTEGRITY — total COGS drawn from tanker 01 across ALL its days must equal its procurement
  // cost (₹96,000), NOT more: freshout added litres, not cost. (Σ 1960 L × 4898p ≈ 9,600,080.)
  const t1Cogs = (await db.tankerConsumption.aggregate({ where: { tankerId: t1, channel: { in: ["RETAIL", "B2B"] } }, _sum: { costPaise: true, litres: true } }))._sum;
  ok("S4: total tanker-01 COGS = procurement cost (freshout added NO cost)", near((t1Cogs.costPaise ?? 0), 9600000, 200) && near((t1Cogs.litres ?? 0), 1960), `cogs=${t1Cogs.costPaise} litres=${t1Cogs.litres}`);
  // Ledger reconciles: every sold litre costed, none lost or double-counted.
  const totalSold = 1920 + 30 + 25; // 1975 L across 3 days
  const totalDrawn = ((await db.tankerConsumption.aggregate({ where: { channel: { in: ["RETAIL", "B2B"] } }, _sum: { litres: true } }))._sum.litres) ?? 0;
  ok("S4: ledger reconciles — Σ consumption == Σ sold (1975 L), no litre lost/double-counted", near(totalDrawn, totalSold), `drawn=${totalDrawn} sold=${totalSold}`);
  // INVARIANT: opening + freshout = consumed + remaining.
  const T1f = (await tankerNow(t1))!;
  ok("INV: opening 1920 + freshout 40 = consumed + remaining", near(T1f.litres + T1f.freshoutLitres, T1f.consumedLitres + T1f.remainingLitres) && near(T1f.litres + T1f.freshoutLitres, 1960), `usable=${T1f.litres + T1f.freshoutLitres} used=${T1f.consumedLitres} rem=${T1f.remainingLitres}`);
  void fres;
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Freshout Milk Management E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
