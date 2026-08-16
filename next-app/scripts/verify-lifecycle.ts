/* E2E verification for the Subscription Lifecycle Engine against the real DB.
   Creates a throwaway customer + a 7-day subscription, exercises every scenario,
   asserts, and CLEANS UP. Run: npx tsx scripts/verify-lifecycle.ts */
import { PrismaClient } from "@prisma/client";
import {
  reconcileSchedule, skipOrCancelDates, adjustMissedDelivery, reinstateDelivery,
  extendSubscription, cancelAllFutureDeliveries, maybeCompleteSubscription,
} from "../lib/subscriptions/deliveries";
import { cancelSubscription, computeRemainingValue, changeFrequency, changeQuantity, changeProduct, previewSubscriptionChange } from "../lib/subscriptions/admin";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });
const IST = 5.5 * 3600e3;
const istKey = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const actor = { actorRole: "super_admin" };

let userId = "", addrId = "", variantId = "", p7 = "";
const subs: string[] = [];

async function mkSub(target: number, startOffsetDays = 0): Promise<string> {
  const start = startOfDay(new Date(Date.now() + startOffsetDays * 864e5));
  const end = new Date(start); end.setDate(end.getDate() + target);
  const sub = await db.subscription.create({ data: { userId, planId: p7, addressId: addrId, status: "ACTIVE", startDate: start, endDate: end, deliverySlot: "06:00-08:00", nextDeliveryAt: start, targetDeliveries: target, autoRenew: false, items: { create: [{ variantId, qty: 1 }] } }, select: { id: true } });
  subs.push(sub.id);
  await reconcileSchedule(sub.id);
  return sub.id;
}
const dels = (subId: string) => db.delivery.findMany({ where: { subscriptionId: subId }, orderBy: { date: "asc" }, select: { id: true, date: true, status: true, driverId: true } });
const counted = (ds: { status: string }[]) => ds.filter((d) => !["SKIPPED", "FAILED"].includes(d.status)).length;
const endOf = async (subId: string) => (await db.subscription.findUnique({ where: { id: subId }, select: { endDate: true } }))?.endDate ?? null;

async function setup() {
  const pin = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  const u = await db.user.create({ data: { email: "lifecycletest+" + Date.now() + "@doodly.test", name: "Lifecycle Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  addrId = (await db.address.create({ data: { userId, label: "Home", line1: "1 Test", city: "Vijayawada", pincode: pin?.pincode ?? "520013", isDefault: true } })).id;
  variantId = (await db.variant.findFirst({ where: { product: { slug: "milk" } }, select: { id: true } }))!.id;
  p7 = (await db.plan.findUnique({ where: { slug: "p7" }, select: { id: true } }))!.id;
}

async function run() {
  await setup();

  // baseline: 7-day sub → 7 scheduled
  const s1 = await mkSub(7);
  let d = await dels(s1);
  ok("7-day sub materialises 7 deliveries", d.length === 7, `got ${d.length}`);
  const end0 = await endOf(s1);

  // Scenario 1 — cancel ONE date → that day SKIPPED, still 7 counted, end +1, make-up appended
  await skipOrCancelDates(s1, [d[2].date], actor);
  d = await dels(s1);
  const end1 = await endOf(s1);
  ok("S1 cancel-date: day marked SKIPPED", d.filter((x) => x.status === "SKIPPED").length === 1);
  ok("S1 cancel-date: still 7 counted (make-up added)", counted(d) === 7, `counted ${counted(d)}`);
  ok("S1 cancel-date: end date extended +1", !!end0 && !!end1 && istKey(end1!) === istKey(new Date(end0!.getTime() + 864e5)), `${end0 && istKey(end0)} -> ${end1 && istKey(end1)}`);

  // Scenario 3 — ops MISS a day (adjust) → FAILED, still 7 counted, end +1
  const missable = (await dels(s1)).filter((x) => x.status === "SCHEDULED")[0];
  await adjustMissedDelivery(missable.id, "OPS_MISSED", "vehicle issue", actor);
  d = await dels(s1);
  const end3 = await endOf(s1);
  ok("S3 adjust: day marked FAILED", d.some((x) => x.status === "FAILED"));
  ok("S3 adjust: still 7 counted (make-up added)", counted(d) === 7, `counted ${counted(d)}`);
  ok("S3 adjust: end +1 again", !!end1 && !!end3 && istKey(end3!) === istKey(new Date(end1!.getTime() + 864e5)));

  // Scenario 4 — a SECOND miss → end +1 more (two make-ups total)
  const missable2 = (await dels(s1)).filter((x) => x.status === "SCHEDULED")[0];
  await adjustMissedDelivery(missable2.id, "WEATHER", null, actor);
  const end4 = await endOf(s1);
  ok("S4 two misses: end +1 more", !!end3 && !!end4 && istKey(end4!) === istKey(new Date(end3!.getTime() + 864e5)));
  ok("S4 two misses: still 7 counted", counted(await dels(s1)) === 7);

  // Reinstate the SKIPPED day → back to SCHEDULED, surplus make-up dropped, still 7 counted
  const skippedDel = (await dels(s1)).find((x) => x.status === "SKIPPED")!;
  await reinstateDelivery(skippedDel.id, actor);
  d = await dels(s1);
  ok("Reinstate: no SKIPPED left + still 7 counted", d.filter((x) => x.status === "SKIPPED").length === 0 && counted(d) === 7, `counted ${counted(d)}`);

  // Scenario 5 — adjust an ASSIGNED delivery → detached (driver cleared) + made up
  const s5 = await mkSub(7);
  const drv = await db.driver.findFirst({ select: { id: true } });
  const assignedDel = (await dels(s5))[0];
  if (drv) await db.delivery.update({ where: { id: assignedDel.id }, data: { driverId: drv.id, status: "ASSIGNED" } });
  await adjustMissedDelivery(assignedDel.id, "EXECUTIVE_ISSUE", null, actor);
  const after5 = (await dels(s5)).find((x) => x.id === assignedDel.id)!;
  ok("S5 adjust after assignment: detached (no driver) + FAILED", after5.status === "FAILED" && !after5.driverId);
  ok("S5 adjust after assignment: still 7 counted", counted(await dels(s5)) === 7);

  // Extend by 3 → target 10, three more appended
  await extendSubscription(s5, 3, "goodwill", actor);
  ok("Extend +3: 10 counted", counted(await dels(s5)) === 10, `counted ${counted(await dels(s5))}`);

  // Idempotency — reconcile twice creates nothing new
  const before = (await dels(s5)).length;
  await reconcileSchedule(s5); await reconcileSchedule(s5);
  ok("Idempotent: reconcile adds no duplicates", (await dels(s5)).length === before);

  // Completion — deliver all of a fresh sub → COMPLETED at target
  const s6 = await mkSub(3);
  await db.delivery.updateMany({ where: { subscriptionId: s6 }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  const done = await maybeCompleteSubscription(s6);
  ok("Complete at DELIVERED>=target", done && (await db.subscription.findUnique({ where: { id: s6 }, select: { status: true } }))?.status === "COMPLETED");

  // Scenario 2 — full cancel with wallet refund → CANCELLED, future gone, wallet credited
  const s2 = await mkSub(7);
  const quote = await computeRemainingValue(s2);
  ok("Refund quote = remaining × per-delivery", quote.remaining === 7 && quote.amountPaise === 7 * quote.perDeliveryPaise, JSON.stringify(quote));
  const walletBefore = (await db.user.findUnique({ where: { id: userId }, select: { walletPaise: true } }))!.walletPaise;
  await cancelSubscription(s2, { reason: "test", scope: "remaining", refund: { method: "wallet", amountPaise: quote.amountPaise } }, actor);
  const s2row = await db.subscription.findUnique({ where: { id: s2 }, select: { status: true } });
  const futureLeft = await db.delivery.count({ where: { subscriptionId: s2, status: { not: "DELIVERED" } } });
  const walletAfter = (await db.user.findUnique({ where: { id: userId }, select: { walletPaise: true } }))!.walletPaise;
  ok("S2 full cancel: CANCELLED + no future stops", s2row?.status === "CANCELLED" && futureLeft === 0, `future ${futureLeft}`);
  ok("S2 full cancel: wallet credited by refund", walletAfter - walletBefore === quote.amountPaise, `+${walletAfter - walletBefore}`);

  // Scenario 6 — daily → alternate-day frequency change (future re-spaced, entitlement preserved)
  const s7 = await mkSub(8);
  await changeFrequency(s7, 2, actor);
  d = await dels(s7);
  ok("S6 change-frequency: still 8 counted (entitlement preserved)", counted(d) === 8, `counted ${counted(d)}`);
  const cdays = d.filter((x) => !["SKIPPED", "FAILED"].includes(x.status)).map((x) => startOfDay(x.date).getTime()).sort((a, b) => a - b);
  const cgaps = cdays.slice(1).map((t, i) => Math.round((t - cdays[i]) / 864e5));
  ok("S6 change-frequency: future re-spaced to alternate-day (all gaps 2)", cgaps.length > 0 && cgaps.every((g) => g === 2), `gaps ${cgaps.join(",")}`);

  // Cadence create — an alternate-day sub materialises with 2-day gaps from the start
  const s8 = (await db.subscription.create({ data: { userId, planId: p7, addressId: addrId, status: "ACTIVE", startDate: startOfDay(new Date(Date.now() + 864e5)), deliverySlot: "06:00-08:00", cadence: 2, targetDeliveries: 6, autoRenew: false, items: { create: [{ variantId, qty: 1 }] } }, select: { id: true } })).id;
  subs.push(s8);
  await reconcileSchedule(s8);
  const ad = (await dels(s8)).map((x) => startOfDay(x.date).getTime()).sort((a, b) => a - b);
  const agaps = ad.slice(1).map((t, i) => Math.round((t - ad[i]) / 864e5));
  ok("Cadence create: alternate-day materialises 6 deliveries", ad.length === 6, `got ${ad.length}`);
  ok("Cadence create: every gap is 2 days", agaps.length > 0 && agaps.every((g) => g === 2), `gaps ${agaps.join(",")}`);
  ok("Cadence create: no duplicate days", new Set(ad).size === ad.length);

  // Change quantity — future SCHEDULED bottleCount backfilled, count unchanged
  const s9 = await mkSub(5);
  await changeQuantity(s9, 3, actor);
  const q9 = await dels(s9);
  const qItem = await db.subscriptionItem.findFirst({ where: { subscriptionId: s9 }, select: { qty: true } });
  const futBottles = await db.delivery.findMany({ where: { subscriptionId: s9, status: "SCHEDULED" }, select: { bottleCount: true } });
  ok("Change-qty: item qty = 3", qItem?.qty === 3);
  ok("Change-qty: future bottleCount = 3, still 5 counted", counted(q9) === 5 && futBottles.length > 0 && futBottles.every((b) => b.bottleCount === 3), `n=${futBottles.length}`);

  // Change product — from-now variant swap (needs a 2nd subscription variant), count unchanged
  const v2 = await db.variant.findFirst({ where: { active: true, type: "SUBSCRIPTION", id: { not: variantId } }, select: { id: true } });
  if (v2) {
    const s10 = await mkSub(4);
    const before10 = counted(await dels(s10));
    await changeProduct(s10, v2.id, actor);
    const it10 = await db.subscriptionItem.findFirst({ where: { subscriptionId: s10 }, select: { variantId: true } });
    ok("Change-product: variant swapped + count unchanged", it10?.variantId === v2.id && counted(await dels(s10)) === before10);
  } else ok("Change-product: skipped (only one subscription variant in DB)", true);

  // Preview — dry-run writes NOTHING and reports the diff
  const s11 = await mkSub(6);
  const rowsBefore = (await dels(s11)).length;
  const pv = await previewSubscriptionChange(s11, { cadence: 2 });
  const rowsAfter = (await dels(s11)).length;
  ok("Preview: dry-run writes nothing + reports daily→alternate", rowsBefore === rowsAfter && pv.current.cadence === 1 && pv.proposed.cadence === 2 && pv.changed);

  // Invariant — SKIP + MISS never produce a DELIVERED row, so inventory is never deducted by them
  const s12 = await mkSub(5);
  await skipOrCancelDates(s12, [(await dels(s12))[0].date], actor);
  await adjustMissedDelivery((await dels(s12)).filter((x) => x.status === "SCHEDULED")[0].id, "ADMIN_ADJUSTMENT", null, actor);  // non-ops reason → no admin alert email
  ok("Invariant: skip+miss produce NO delivered rows (no inventory deduction)", (await dels(s12)).filter((x) => x.status === "DELIVERED").length === 0);
}

async function cleanup() {
  if (!userId) return;
  const delIds = (await db.delivery.findMany({ where: { subscriptionId: { in: subs } }, select: { id: true } })).map((x) => x.id);
  await db.assignmentLog.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.deliveryAssignment.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.assignmentQueue.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.delivery.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
  await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
  await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: subs } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { id: { in: subs } } }).catch(() => {});
  await db.walletTxn.deleteMany({ where: { userId } }).catch(() => {});
  await db.notification.deleteMany({ where: { userId } }).catch(() => {});
  await db.address.deleteMany({ where: { userId } }).catch(() => {});
  await db.user.delete({ where: { id: userId } }).catch(() => {});
}

run().catch((e) => ok("RUN ERROR", false, (e as Error)?.message)).finally(async () => {
  await cleanup();
  const passed = R.filter((r) => r.pass).length;
  console.log("\n=== Subscription Lifecycle verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
