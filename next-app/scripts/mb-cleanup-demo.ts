/* Restore the clean single-seed-tanker DEV baseline by removing the demo data
   accumulated while demonstrating the private module:
     - the E2E Cafe B2B business (code DOO-B2B-000001) + its BusinessPricing
       + its B2B orders (and each order's invoice / payments / items / events /
       revenue adjustments);
     - the demo CONTINUITY tanker TNK-20260908-0002.

   The B2B order's 97 L milk draw is reversed the ENGINE's own way: delete the
   order, then re-settle its delivered IST day so settleDay()'s reverseByRef
   returns the litres to the seed tanker (never a hand-edit of remainingLitres).

   DEV DB ONLY. Prints state first; mutates only with --confirm. */
import { db } from "../lib/db";
import { settleDay } from "../lib/milk/settle";
import { istISO } from "../lib/delivery/stats";

const DEMO_BIZ_CODE = "DOO-B2B-000001";
// The demo continuity tanker to drop; override with --tanker=CODE to remove a
// specific test tanker (e.g. one added while testing the + Add tanker shortcut).
const tankerArg = (process.argv.find((a) => a.startsWith("--tanker=")) || "").split("=")[1];
const DEMO_TANKER_CODE = tankerArg || "TNK-20260908-0002";
const CONFIRM = process.argv.includes("--confirm");

function assertDevDb() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);
}

async function snapshot(tag: string) {
  const tankers = await db.milkTanker.findMany({ orderBy: { continuitySequence: "asc" }, select: { id: true, code: true, litres: true, consumedLitres: true, remainingLitres: true, status: true, continuityType: true, continuityChainId: true, continuitySequence: true } });
  const biz = await db.business.findMany({ select: { id: true, code: true, name: true } });
  const orders = await db.businessOrder.findMany({ select: { id: true, code: true, status: true, revenuePaise: true, deliveredAt: true } });
  const cons = await db.tankerConsumption.groupBy({ by: ["channel"], _sum: { litres: true, costPaise: true }, _count: true });
  const pend = await db.milkPendingAllocation.count({ where: { status: "PENDING" } });
  const alloc = await db.milkOrderAllocation.count();
  console.log(`\n===== ${tag} =====`);
  console.log("Tankers:");
  for (const t of tankers) console.log(`  ${t.code}  ${t.continuityType}/seq${t.continuitySequence}  ${t.status}  litres=${t.litres}  consumed=${t.consumedLitres}  remaining=${t.remainingLitres}  chain=${t.continuityChainId ?? "—"}`);
  console.log("Businesses:", biz.length ? biz.map((b) => `${b.code}(${b.name})`).join(", ") : "none");
  console.log("B2B orders:", orders.length ? orders.map((o) => `${o.code}[${o.status}${o.revenuePaise != null ? " rev₹" + (o.revenuePaise / 100).toFixed(0) : ""}]`).join(", ") : "none");
  console.log("Consumption by channel:", cons.length ? cons.map((c) => `${c.channel}=${(c._sum.litres ?? 0).toFixed(2)}L/₹${((c._sum.costPaise ?? 0) / 100).toFixed(0)}(${c._count})`).join(", ") : "none");
  console.log(`MilkPendingAllocation(PENDING)=${pend}  MilkOrderAllocation=${alloc}`);
  return { tankers, biz, orders };
}

async function main() {
  assertDevDb();
  const before = await snapshot("BEFORE");

  if (!CONFIRM) {
    console.log("\n(dry run) — re-run with --confirm to delete the demo data above and restore the baseline.");
    return;
  }

  // 1) Collect the demo business + its orders (capture delivered days to re-settle).
  const bizList = await db.business.findMany({ where: { OR: [{ code: DEMO_BIZ_CODE }, { name: { contains: "E2E", mode: "insensitive" } }] }, select: { id: true, code: true } });
  const bizIds = bizList.map((b) => b.id);
  const orders = bizIds.length ? await db.businessOrder.findMany({ where: { businessId: { in: bizIds } }, select: { id: true, deliveredAt: true } }) : [];
  const orderIds = orders.map((o) => o.id);
  const daysToResettle = [...new Set(orders.filter((o) => o.deliveredAt).map((o) => istISO(o.deliveredAt as Date)))];

  // 2) Delete each order's dependants (invoice is a REQUIRED relation → must go first),
  //    then the orders (items / events / revenue-adjustments cascade on the order).
  if (orderIds.length) {
    const invs = await db.businessInvoice.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
    if (invs.length) await db.businessInvoiceEvent.deleteMany({ where: { invoiceId: { in: invs.map((i) => i.id) } } });
    await db.businessInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.businessPayment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } });
    console.log(`Deleted ${orderIds.length} B2B order(s) + invoice/payment dependants.`);
  }

  // 3) Re-settle each affected day — reverses the now-gone orders' B2B milk draw
  //    (returns the litres to the seed tanker) and clears any pending allocation.
  for (const d of daysToResettle) {
    const s = await settleDay(d, { actorRole: "super_admin", quiet: true }).catch((e) => { console.warn("re-settle failed", d, e?.message); return null; });
    if (s) console.log(`Re-settled ${d}: drew ${s.totalLitres.toFixed(2)}L (retail ${s.retail.allocatedLitres.toFixed(2)} + b2b ${s.b2b.allocatedLitres.toFixed(2)}), COGS ₹${(s.cogsPaise / 100).toFixed(2)}.`);
  }

  // 4) Remove the demo business + its pricing / any residual payments-invoices.
  if (bizIds.length) {
    await db.businessInvoice.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessPayment.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessPricing.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } });
    console.log(`Deleted demo business(es): ${bizList.map((b) => b.code).join(", ")}.`);
  }

  // 5) Remove the demo CONTINUITY tanker (guard: must have no consumption / allocations
  //    referencing it, so the ledger stays consistent).
  const demoT = await db.milkTanker.findFirst({ where: { code: DEMO_TANKER_CODE }, select: { id: true, code: true, consumedLitres: true } });
  if (demoT) {
    const c = await db.tankerConsumption.count({ where: { tankerId: demoT.id } });
    const a = await db.milkOrderAllocation.count({ where: { tankerId: demoT.id } });
    if (c > 0 || a > 0 || (demoT.consumedLitres ?? 0) > 0.001) {
      console.warn(`SKIP tanker ${demoT.code}: has ${c} consumption + ${a} allocation row(s) / consumed=${demoT.consumedLitres} — not a clean demo tanker, leaving it.`);
    } else {
      await db.milkTanker.delete({ where: { id: demoT.id } });
      console.log(`Deleted demo continuity tanker ${demoT.code}.`);
    }
  } else {
    console.log(`No tanker ${DEMO_TANKER_CODE} found (already clean).`);
  }

  const after = await snapshot("AFTER");
  const seed = after.tankers.find((t) => t.code === "TNK-20260908-0001");
  const ok = after.biz.length === 0 && after.orders.length === 0 && after.tankers.length === 1 && seed != null && Math.abs((seed.remainingLitres ?? 0) - (seed.litres ?? 0)) < 0.01 && (seed.consumedLitres ?? 0) < 0.01;
  console.log(ok ? "\n✅ Baseline restored: 1 seed tanker at full stock, no demo business/orders, no consumption." : "\n⚠ Review the AFTER snapshot — baseline not exactly as expected (see above).");
}

main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
