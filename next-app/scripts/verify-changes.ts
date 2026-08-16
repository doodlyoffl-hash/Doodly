/* =============================================================
   DOODLY — Change actions verification (SELF-CLEANING).
   changeFrequency (re-space, entitlement preserved), changeQuantity (backfill),
   changeProduct (from-now swap), and previewSubscriptionChange (dry-run writes NOTHING).
   Run (from next-app/, dev server stopped): npx tsx scripts/verify-changes.ts
   ============================================================= */
import { db } from "@/lib/db";
import { reconcileSchedule, simulateFutureDates } from "@/lib/subscriptions/deliveries";
import { changeFrequency, changeQuantity, changeProduct, previewSubscriptionChange } from "@/lib/subscriptions/admin";

const TAG = "ZZZ_CHANGES_E2E_DELETE_ME";
const DAY = 86_400_000;
const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const countedRows = (subId: string) => db.delivery.findMany({ where: { subscriptionId: subId, status: { notIn: ["SKIPPED", "FAILED", "CUSTOMER_UNAVAILABLE", "RESCHEDULED"] } }, select: { date: true, bottleCount: true }, orderBy: { date: "asc" } });

async function main() {
  const R: string[] = []; let fail = false;
  const A = (ok: boolean, m: string) => { R.push((ok ? "   ✓ " : "   ✗ ") + m); if (!ok) fail = true; };
  const actor = { actorId: undefined, actorRole: "system" };
  try {
    const plan = await db.plan.findFirst({ where: { active: true }, select: { id: true } });
    const variants = await db.variant.findMany({ where: { active: true, type: "SUBSCRIPTION" }, select: { id: true }, take: 2 });
    if (!plan || variants.length < 1) throw new Error("need an active plan + a subscription variant");
    const user = await db.user.create({ data: { name: `${TAG}_${Date.now()}`, role: "CUSTOMER" }, select: { id: true } });
    const addr = await db.address.create({ data: { userId: user.id, line1: "changes test", city: "Vijayawada", pincode: "520007", verified: true, serviceable: true }, select: { id: true } });
    const start = startOf(new Date(Date.now() + DAY));
    const sub = await db.subscription.create({ data: { userId: user.id, planId: plan.id, addressId: addr.id, status: "ACTIVE", cadence: 1, targetDeliveries: 10, startDate: start, deliverySlot: "06:00-08:00", autoRenew: false, items: { create: [{ variantId: variants[0].id, qty: 1 }] } }, select: { id: true } });
    await reconcileSchedule(sub.id);

    // ---- PREVIEW first (must be a pure dry-run: NO writes) ----
    const before = await db.delivery.count({ where: { subscriptionId: sub.id } });
    const pv = await previewSubscriptionChange(sub.id, { cadence: 2 });
    const after = await db.delivery.count({ where: { subscriptionId: sub.id } });
    A(before === after, `preview: dry-run wrote NOTHING (delivery rows ${before} → ${after})`);
    A(pv.current.cadence === 1 && pv.proposed.cadence === 2 && pv.changed, "preview: reports daily → alternate-day, changed=true");
    A(pv.proposed.next.length > 1 && pv.current.next.length > 1 && pv.proposed.next[1] !== pv.current.next[1], "preview: proposed schedule differs from current");

    // ---- changeFrequency (re-space, entitlement preserved) ----
    await changeFrequency(sub.id, 2, actor);
    let rows = await countedRows(sub.id);
    A(rows.length === 10, `frequency: entitlement preserved — still 10 counted deliveries (got ${rows.length})`);
    const gaps = rows.slice(1).map((r, i) => Math.round((startOf(r.date).getTime() - startOf(rows[i].date).getTime()) / DAY));
    A(gaps.length > 0 && gaps.every((g) => g === 2), `frequency: re-spaced to alternate-day, every gap 2 (got ${gaps.join(",")})`);

    // ---- changeQuantity (backfill future bottleCount) ----
    await changeQuantity(sub.id, 3, actor);
    rows = await countedRows(sub.id);
    const item = await db.subscriptionItem.findFirst({ where: { subscriptionId: sub.id }, select: { qty: true, variantId: true } });
    A(item?.qty === 3, `quantity: item qty set to 3 (got ${item?.qty})`);
    A(rows.length === 10 && rows.every((r) => r.bottleCount === 3), `quantity: future rows backfilled to bottleCount 3, count unchanged (n=${rows.length})`);

    // ---- changeProduct (from-now swap) ----
    if (variants.length >= 2) {
      const nRows = (await countedRows(sub.id)).length;
      await changeProduct(sub.id, variants[1].id, actor);
      const it2 = await db.subscriptionItem.findFirst({ where: { subscriptionId: sub.id }, select: { variantId: true } });
      const nRows2 = (await countedRows(sub.id)).length;
      A(it2?.variantId === variants[1].id, "product: item variant swapped to the new product");
      A(nRows === nRows2, `product: from-now swap keeps the schedule (count ${nRows} → ${nRows2})`);
    } else {
      A(true, "product: only one subscription variant in DB — swap skipped (not a failure)");
    }

    // ---- simulateFutureDates parity (engine sanity) ----
    const sim = await simulateFutureDates(sub.id, {});
    A(sim.future.length > 0 && sim.endDate != null, "simulate: projects a non-empty future schedule + end date");
  } catch (e) { fail = true; R.push("   ERROR: " + (e as Error).message); }
  finally {
    R.forEach((x) => console.log(x));
    const users = await db.user.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    for (const u of users) {
      const subs = (await db.subscription.findMany({ where: { userId: u.id }, select: { id: true } })).map((s) => s.id);
      await db.delivery.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
      await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
      await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
      await db.subscription.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.address.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("   user delete:", (e as Error).message));
    }
    const left = await db.user.count({ where: { name: { startsWith: TAG } } });
    console.log(`   residue: test users left = ${left} → ${left === 0 ? "ZERO ✓" : "NON-ZERO ✗"}`);
    if (left !== 0) fail = true;
    await db.$disconnect();
  }
  console.log(fail ? "RESULT: FAILED" : "RESULT: PASSED — change actions + dry-run preview verified, self-cleaned");
  process.exit(fail ? 1 : 0);
}
main();
