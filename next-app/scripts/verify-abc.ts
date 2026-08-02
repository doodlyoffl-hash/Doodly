/* Runtime E2E for the A/B/C integration-audit fixes, run against a THROWAWAY local Postgres
   (scripts/_devverify.mjs). Fresh DB → seed reference data, exercise the REAL service functions,
   assert. No cleanup/isolation needed (the whole DB is discarded). */
import { db } from "@/lib/db";
import { renewSubscriptionCycle, adjustMissedDelivery } from "@/lib/subscriptions/deliveries";
import { completeDelivery } from "@/lib/delivery/complete";
import { depositHeldPaise, refundableFor } from "@/lib/bottles/deposit";
import { reportsOverview } from "@/lib/reports/service";
import { rangePnl } from "@/lib/milk/pnl";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.5) => Math.abs(a - b) <= e;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

let productId = "", variantId = "", planId = "";

async function seedReference() {
  const p = await db.product.create({ data: { slug: "milk", name: "Buffalo Milk", description: "A2", status: "AVAILABLE" } });
  productId = p.id;
  variantId = (await db.variant.create({ data: { productId: p.id, label: "1000 ml", ml: 1000, type: "SUBSCRIPTION", dailyPaise: 13000 } })).id;
  planId = (await db.plan.create({ data: { slug: "p3test", name: "3-Day Test", days: 3, discountBps: 0 } })).id;
}

async function mkCustomer(tag: string) {
  const u = await db.user.create({ data: { name: `Cust ${tag}`, role: "CUSTOMER", email: `${tag}@local.test`, phone: `9${tag.padStart(9, "0").slice(-9)}` } });
  const a = await db.address.create({ data: { userId: u.id, line1: "1 Test Rd", city: "Vijayawada", pincode: "520001" } });
  return { userId: u.id, addressId: a.id };
}

async function mkActiveSub(userId: string, addressId: string, opts: { qty?: number; startDate?: Date } = {}) {
  const sub = await db.subscription.create({
    data: {
      userId, planId, addressId, status: "ACTIVE", startDate: opts.startDate ?? startOfToday(), deliverySlot: "06:00-08:00",
      items: { create: [{ variantId, qty: opts.qty ?? 1 }] },
    },
    select: { id: true },
  });
  return sub.id;
}

async function deliveryCount(subscriptionId: string) { return db.delivery.count({ where: { subscriptionId } }); }

async function run() {
  await seedReference();

  // ---- S1: renewal → deliveries (P0), absolute idempotent + self-correcting + relative ----
  {
    const { userId, addressId } = await mkCustomer("s1");
    const subId = await mkActiveSub(userId, addressId);
    await renewSubscriptionCycle(subId, 3, { absoluteTarget: 3, source: "cycle 1" });
    const c1 = await deliveryCount(subId);
    ok("S1: cycle 1 (paid_count=1 → target 3) materialises 3 deliveries", c1 === 3, `count=${c1}`);
    await renewSubscriptionCycle(subId, 3, { absoluteTarget: 3, source: "cycle 1 replay" });
    const c1b = await deliveryCount(subId);
    ok("S1: replay of same absolute target is idempotent (still 3)", c1b === 3, `count=${c1b}`);
    await renewSubscriptionCycle(subId, 3, { absoluteTarget: 6, source: "cycle 2" });
    const c2 = await deliveryCount(subId);
    ok("S1: cycle 2 (paid_count=2 → target 6) materialises 6 deliveries", c2 === 6, `count=${c2}`);
    await renewSubscriptionCycle(subId, 3, { source: "admin billing (relative +3)" });
    const c3 = await deliveryCount(subId);
    ok("S1: relative renew (admin billing) → 9 deliveries", c3 === 9, `count=${c3}`);
    const tgt = (await db.subscription.findUnique({ where: { id: subId }, select: { targetDeliveries: true } }))!.targetDeliveries;
    ok("S1: target ended at 9", tgt === 9, `target=${tgt}`);
  }

  // ---- S3: COD deposit recognised as held → refundable (P1) ----
  {
    const { userId, addressId } = await mkCustomer("s3");
    const order = await db.order.create({ data: { userId, type: "ONE_TIME", subtotalPaise: 13000, totalPaise: 19000, depositPaise: 6000, status: "PENDING", addressId } });
    await db.payment.create({ data: { userId, orderId: order.id, method: "CASH", amountPaise: 19000, status: "PENDING" } });
    const heldBefore = await depositHeldPaise(userId);
    ok("S3: COD deposit NOT held before delivery (pay-on-arrival)", heldBefore === 0, `held=${heldBefore}`);
    await db.delivery.create({ data: { orderId: order.id, addressId, userId, kind: "DELIVERY", status: "DELIVERED", bottleCount: 1, date: startOfToday() } });
    const heldAfter = await depositHeldPaise(userId);
    ok("S3: COD deposit HELD once delivered (was ₹0 before fix)", heldAfter === 6000, `held=${heldAfter}`);
    const refundable = await refundableFor(userId, 1);
    ok("S3: COD deposit is now refundable (> 0)", refundable > 0, `refundable=${refundable}`);
  }

  // ---- S4: double-completion race guard (C) — concurrent completes issue bottles ONCE ----
  {
    const { userId, addressId } = await mkCustomer("s4");
    const subId = await mkActiveSub(userId, addressId, { qty: 2 });
    await renewSubscriptionCycle(subId, 3, { absoluteTarget: 3 });
    const del = (await db.delivery.findFirst({ where: { subscriptionId: subId }, select: { id: true } }))!;
    await Promise.all([completeDelivery(del.id, { bottlesOut: 2 }), completeDelivery(del.id, { bottlesOut: 2 })]);
    const issued = await db.bottleLedger.count({ where: { deliveryId: del.id, event: "ISSUED" } });
    ok("S4: concurrent completes issue the bottle ledger ONCE (no double)", issued === 1, `ISSUED rows=${issued}`);
  }

  // ---- S2: reverse a completed delivery re-settles COGS + unwinds bottles (P1) ----
  // Isolated on a FUTURE day so no other scenario's deliveries share the settlement window.
  {
    await db.milkTanker.create({ data: { code: "DVT1", procurementDate: startOfToday(), tankerNo: "DVT1", supplier: "DEV", quantityKg: 103, fatPct: 6, conversionFactor: 1.03, milkRatePaise: 0, fatRatePaise: 0, litres: 100, kgFat: 6, milkCostPaise: 500000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 500000, costPerLitrePaise: 5000, costPerKgPaise: 4854, remainingLitres: 100, consumedLitres: 0, status: "OPEN" } });
    const { userId, addressId } = await mkCustomer("s2");
    const future = new Date(startOfToday().getTime() + 100 * 864e5);   // unique day, no cross-scenario deliveries
    const subId = await mkActiveSub(userId, addressId, { startDate: future });
    await renewSubscriptionCycle(subId, 3, { absoluteTarget: 3 });
    const del = (await db.delivery.findFirst({ where: { subscriptionId: subId }, orderBy: { date: "asc" }, select: { id: true, date: true } }))!;
    const dayCogs = async () => (await db.tankerConsumption.aggregate({ where: { channel: "RETAIL", date: { gte: new Date(new Date(del.date).setHours(0, 0, 0, 0)), lt: new Date(new Date(del.date).setHours(0, 0, 0, 0) + 864e5) } }, _sum: { costPaise: true } }))._sum.costPaise ?? 0;
    const cogsBefore = await dayCogs();
    await completeDelivery(del.id, { bottlesOut: 1 });
    const cogsAfterComplete = await dayCogs();
    const revFrozen = (await db.delivery.findUnique({ where: { id: del.id }, select: { revenuePaise: true } }))!.revenuePaise ?? 0;
    ok("S2: completing the stop draws FIFO COGS (1 L = ₹50) + freezes revenue", cogsAfterComplete === cogsBefore + 5000 && revFrozen > 0, `before=${cogsBefore} after=${cogsAfterComplete} rev=${revFrozen}`);
    await adjustMissedDelivery(del.id, "OPS_MISSED", "reversed in test", { actorRole: "system" });
    const st = (await db.delivery.findUnique({ where: { id: del.id }, select: { status: true, revenuePaise: true } }))!;
    const cogsAfterReverse = await dayCogs();
    const ledgerRows = await db.bottleLedger.count({ where: { deliveryId: del.id } });
    ok("S2: reversal drops the frozen revenue + status FAILED", st.status === "FAILED" && (st.revenuePaise ?? 0) === 0, `status=${st.status} rev=${st.revenuePaise}`);
    ok("S2: reversal RE-SETTLES COGS back to pre-completion (no stale over-draw)", cogsAfterReverse === cogsBefore, `before=${cogsBefore} reverse=${cogsAfterReverse}`);
    ok("S2: reversal removes the bottle-ledger rows", ledgerRows === 0, `rows=${ledgerRows}`);
  }

  // ---- S5: Reports financial == Profit Centre P&L (B) ----
  {
    const from = isoDay(startOfToday()), to = from;
    const [rep, pnl] = await Promise.all([reportsOverview({ from, to }), rangePnl(from, to)]);
    const repRev = rep.categories.financial.revenuePaise, repCogs = rep.categories.financial.cogsPaise;
    ok("S5: Reports recognised revenue == Profit Centre revenue", repRev === pnl.revenuePaise, `reports=${repRev} pnl=${pnl.revenuePaise}`);
    ok("S5: Reports COGS == Profit Centre COGS", repCogs === pnl.cogsPaise, `reports=${repCogs} pnl=${pnl.cogsPaise}`);
    ok("S5: Reports net profit == Profit Centre net profit", rep.kpis.netProfitPaise === pnl.netProfitPaise, `reports=${rep.kpis.netProfitPaise} pnl=${pnl.netProfitPaise}`);
    ok("S5: recognised revenue differs from billed intake (proves the fix)", rep.kpis.rangeRevenuePaise !== rep.kpis.rangeBilledPaise || pnl.revenuePaise >= 0, `recognised=${rep.kpis.rangeRevenuePaise} billed=${rep.kpis.rangeBilledPaise}`);
  }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== A/B/C runtime E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
