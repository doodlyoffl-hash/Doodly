/* =============================================================
   DOODLY — Alternate-day cadence verification (SELF-CLEANING).
   Creates throwaway subscriptions, materialises via reconcileSchedule, asserts
   alternate-day spacing + that a skip preserves the count & rhythm + that daily
   is unchanged, then hard-deletes everything and residue-checks.
   Run (from next-app/, dev server stopped): npx tsx scripts/verify-cadence.ts
   ============================================================= */
import { db } from "@/lib/db";
import { reconcileSchedule, skipOrCancelDates } from "@/lib/subscriptions/deliveries";

const TAG = "ZZZ_CADENCE_E2E_DELETE_ME";
const DAY = 86_400_000;
const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const spanDays = (a: Date, b: Date) => Math.round((startOf(b).getTime() - startOf(a).getTime()) / DAY);

async function makeSub(cadence: number, target: number, planId: string, variantId: string, userId: string, addressId: string) {
  const start = startOf(new Date(Date.now() + DAY)); // tomorrow
  const sub = await db.subscription.create({
    data: { userId, planId, addressId, status: "ACTIVE", cadence, targetDeliveries: target, startDate: start, deliverySlot: "06:00-08:00", autoRenew: false, items: { create: [{ variantId, qty: 1 }] } },
    select: { id: true },
  });
  return { subId: sub.id, start };
}
const rows = (subId: string) => db.delivery.findMany({ where: { subscriptionId: subId }, select: { date: true, status: true }, orderBy: { date: "asc" } });

async function main() {
  const R: string[] = []; let fail = false;
  const A = (ok: boolean, m: string) => { R.push((ok ? "   ✓ " : "   ✗ ") + m); if (!ok) fail = true; };
  let userId = "";
  try {
    const plan = await db.plan.findFirst({ where: { active: true }, select: { id: true } });
    const variant = await db.variant.findFirst({ select: { id: true } });
    if (!plan || !variant) throw new Error("need an active plan + a variant");
    const user = await db.user.create({ data: { name: `${TAG}_${Date.now()}`, role: "CUSTOMER" }, select: { id: true } });
    userId = user.id;
    const addr = await db.address.create({ data: { userId, line1: "cadence test", city: "Vijayawada", pincode: "520007", verified: true, serviceable: true }, select: { id: true } });

    // 1. ALTERNATE-DAY (cadence 2): 10 deliveries, every gap 2 days, 18-day span
    const alt = await makeSub(2, 10, plan.id, variant.id, userId, addr.id);
    await reconcileSchedule(alt.subId);
    let ds = await rows(alt.subId);
    A(ds.length === 10, `alternate-day: 10 deliveries created (got ${ds.length})`);
    const gaps = ds.slice(1).map((d, i) => spanDays(ds[i].date, d.date));
    A(gaps.length > 0 && gaps.every((g) => g === 2), `alternate-day: every gap is 2 days (got ${gaps.join(",")})`);
    A(ds.length === 10 && spanDays(ds[0].date, ds[9].date) === 18, `alternate-day: 10 deliveries span 18 calendar days (got ${ds.length ? spanDays(ds[0].date, ds[ds.length - 1].date) : "-"})`);
    const subA = await db.subscription.findUnique({ where: { id: alt.subId }, select: { endDate: true } });
    A(!!subA?.endDate && spanDays(alt.start, subA.endDate) === 18, "alternate-day: endDate reflects the true 18-day span (not 10)");

    // 2. SKIP the 3rd alternate-day delivery → entitlement preserved + rhythm kept
    await skipOrCancelDates(alt.subId, [ds[2].date]);
    ds = await rows(alt.subId);
    const counted = ds.filter((d) => d.status !== "SKIPPED").length;
    A(counted === 10, `skip: entitlement preserved — still 10 counted deliveries (got ${counted}; +1 SKIPPED = ${ds.length} rows)`);
    const fut = ds.filter((d) => d.status !== "SKIPPED").map((d) => startOf(d.date).getTime()).sort((a, b) => a - b);
    const fgaps = fut.slice(1).map((t, i) => Math.round((t - fut[i]) / DAY));
    A(fgaps.every((g) => g === 2 || g === 4), `skip: make-up keeps the alternate rhythm — one 4-day hole where the day was skipped, rest 2 (gaps ${fgaps.join(",")})`);

    // 3. DAILY (cadence 1): unchanged — 5 consecutive days
    const daily = await makeSub(1, 5, plan.id, variant.id, userId, addr.id);
    await reconcileSchedule(daily.subId);
    const dds = await rows(daily.subId);
    A(dds.length === 5, `daily: 5 deliveries (got ${dds.length})`);
    const dgaps = dds.slice(1).map((d, i) => spanDays(dds[i].date, d.date));
    A(dgaps.length > 0 && dgaps.every((g) => g === 1), `daily: every gap is 1 day, unchanged (got ${dgaps.join(",")})`);
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
  console.log(fail ? "RESULT: FAILED" : "RESULT: PASSED — alternate-day cadence works, skip preserves count+rhythm, daily unchanged, self-cleaned");
  process.exit(fail ? 1 : 0);
}
main();
