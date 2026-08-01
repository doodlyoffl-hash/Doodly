/* COMPREHENSIVE E2E — undelivered paid days: detection + both remedies (live PROD DB, self-cleaning).
   Scenario A (roll forward): a recent, ACTIVE regular sub lapsed with 3 past-dated SCHEDULED days
     → listUndelivered recommends rollforward; rollForwardUndelivered marks them FAILED + appends 3
     FUTURE make-ups + extends endDate; re-run is a no-op.
   Scenario B (credit): a trial (no per-day price) lapsed >window → recommends credit; creditUndelivered
     values it from the order (total − deposit) pro-rated, credits the wallet, CANCELS the days, closes
     the sub; re-run credits nothing (no double-credit).
   SAFE: opted-out customers (no external sends); every seeded row deleted.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-undelivered.ts */
import { PrismaClient } from "@prisma/client";
import { listUndelivered, rollForwardUndelivered, creditUndelivered } from "../lib/subscriptions/undelivered";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const IST = 5.5 * 3600e3;
const nowIst = new Date(Date.now() + IST);
const todayStartMs = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST;   // today IST midnight (UTC instant)
const dAgo = (n: number) => new Date(todayStartMs - n * 86400e3);
const ids: { users: string[]; subs: string[]; products: string[]; plans: string[]; orders: string[] } = { users: [], subs: [], products: [], plans: [], orders: [] };

async function seedCommon(tag: string, dailyPaise: number | null) {
  const u = await db.user.create({ data: { name: `UD-${tag} ${stamp}`, role: "CUSTOMER", email: `ud-${tag}-${stamp}@doodly.test` } });
  ids.users.push(u.id);
  await db.customerPreference.create({ data: { userId: u.id, emailOptIn: false, smsOptIn: false, whatsappOptIn: false, pushOptIn: false } });
  const a = await db.address.create({ data: { userId: u.id, line1: "1 Test St", city: "Vijayawada", pincode: "520010" } });
  const p = await db.product.create({ data: { slug: `ud-${tag}-${stamp}`, name: "UD Milk", description: "E2E" } });
  ids.products.push(p.id);
  const v = await db.variant.create({ data: { productId: p.id, label: "1000 ml", ml: 1000, dailyPaise } });
  const plan = await db.plan.create({ data: { slug: `ud-${tag}-p3-${stamp}`, name: "Trial Pack", days: 3, discountBps: 0 } });
  ids.plans.push(plan.id);
  return { u, a, v, plan };
}

async function run() {
  // ---------- Scenario A: roll forward (regular sub, per-day priced, recent lapse) ----------
  {
    const { u, a, v, plan } = await seedCommon("A", 5000);   // ₹50/day
    const sub = await db.subscription.create({ data: { userId: u.id, planId: plan.id, addressId: a.id, startDate: dAgo(5), endDate: dAgo(3), status: "ACTIVE", targetDeliveries: 3, items: { create: [{ variantId: v.id, qty: 1 }] } } });
    ids.subs.push(sub.id);
    for (const n of [5, 4, 3]) await db.delivery.create({ data: { subscriptionId: sub.id, date: dAgo(n), status: "SCHEDULED", kind: "DELIVERY", bottleCount: 1 } });

    const listA = (await listUndelivered()).find((r) => r.subscriptionId === sub.id);
    ok("A1: detected · 3 days · ₹150 · rec=rollforward", !!listA && listA.undeliveredDays === 3 && listA.valuePaise === 15000 && listA.recommendation === "rollforward", JSON.stringify(listA && { d: listA.undeliveredDays, v: listA.valuePaise, rec: listA.recommendation }));

    const rf = await rollForwardUndelivered(sub.id);
    const failed = await db.delivery.count({ where: { subscriptionId: sub.id, status: "FAILED" } });
    const futureSched = await db.delivery.count({ where: { subscriptionId: sub.id, status: "SCHEDULED", date: { gte: new Date(todayStartMs) } } });
    const subA = await db.subscription.findUnique({ where: { id: sub.id }, select: { status: true, endDate: true } });
    ok("A2: 3 stale → FAILED, 3 future make-ups created", rf.missed === 3 && failed === 3 && futureSched === 3, JSON.stringify({ missed: rf.missed, created: rf.created, failed, futureSched }));
    ok("A3: sub still ACTIVE + endDate now in the future", subA?.status === "ACTIVE" && !!subA?.endDate && subA.endDate.getTime() >= todayStartMs, subA?.endDate?.toISOString().slice(0, 10));
    const rf2 = await rollForwardUndelivered(sub.id);
    ok("A4: re-run is a no-op (idempotent)", rf2.missed === 0);
  }

  // ---------- Scenario B: credit (trial, no per-day price, old lapse) ----------
  {
    const { u, a, v, plan } = await seedCommon("B", null);   // trial: no dailyPaise
    const order = await db.order.create({ data: { userId: u.id, subtotalPaise: 20000, totalPaise: 32000, depositPaise: 12000, couponDiscountPaise: 0, status: "PAID", type: "SAMPLE" } });
    ids.orders.push(order.id);
    const sub = await db.subscription.create({ data: { userId: u.id, planId: plan.id, addressId: a.id, orderId: order.id, startDate: dAgo(22), endDate: dAgo(20), status: "ACTIVE", targetDeliveries: 3, items: { create: [{ variantId: v.id, qty: 1 }] } } });
    ids.subs.push(sub.id);
    for (const n of [22, 21, 20]) await db.delivery.create({ data: { subscriptionId: sub.id, date: dAgo(n), status: "SCHEDULED", kind: "DELIVERY", bottleCount: 1 } });

    const listB = (await listUndelivered()).find((r) => r.subscriptionId === sub.id);
    ok("B1: detected · 3 days · ₹200 (order−deposit) · rec=credit", !!listB && listB.undeliveredDays === 3 && listB.valuePaise === 20000 && listB.recommendation === "credit", JSON.stringify(listB && { d: listB.undeliveredDays, v: listB.valuePaise, rec: listB.recommendation }));

    const before = (await db.user.findUnique({ where: { id: u.id }, select: { walletPaise: true } }))!.walletPaise;
    const cr = await creditUndelivered(sub.id);
    const after = (await db.user.findUnique({ where: { id: u.id }, select: { walletPaise: true } }))!.walletPaise;
    const cancelled = await db.delivery.count({ where: { subscriptionId: sub.id, status: "CANCELLED" } });
    const subB = await db.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    ok("B2: wallet credited ₹200, 3 days CANCELLED", cr.credited && cr.amountPaise === 20000 && after - before === 20000 && cancelled === 3, JSON.stringify({ amt: cr.amountPaise, delta: after - before, cancelled }));
    ok("B3: fully-lapsed → subscription COMPLETED", subB?.status === "COMPLETED", subB?.status);
    const cr2 = await creditUndelivered(sub.id);
    const after2 = (await db.user.findUnique({ where: { id: u.id }, select: { walletPaise: true } }))!.walletPaise;
    ok("B4: re-run credits nothing (no double-credit)", !cr2.credited && cr2.amountPaise === 0 && after2 === after, JSON.stringify({ credited: cr2.credited, wallet: after2 }));
  }
}

async function cleanup() {
  try {
    for (const subId of ids.subs) {
      await db.subscriptionEvent.deleteMany({ where: { subscriptionId: subId } }).catch(() => {});
      await db.subscriptionItem.deleteMany({ where: { subscriptionId: subId } }).catch(() => {});
      await db.delivery.deleteMany({ where: { subscriptionId: subId } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { action: { startsWith: "subscription.undelivered." }, target: { startsWith: subId.slice(-6).toUpperCase() } } }).catch(() => {});
    }
    for (const uid of ids.users) {
      await db.walletTxn.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId: uid } }).catch(() => {});
    }
    // subscriptions reference orders (orderId) + plans/addresses; delete subs before orders/plans
    for (const subId of ids.subs) await db.subscription.deleteMany({ where: { id: subId } }).catch(() => {});
    for (const oid of ids.orders) await db.order.deleteMany({ where: { id: oid } }).catch(() => {});
    for (const pid of ids.products) { await db.variant.deleteMany({ where: { productId: pid } }).catch(() => {}); await db.product.deleteMany({ where: { id: pid } }).catch(() => {}); }
    for (const plid of ids.plans) await db.plan.deleteMany({ where: { id: plid } }).catch(() => {});
    for (const uid of ids.users) { await db.address.deleteMany({ where: { userId: uid } }).catch(() => {}); await db.customerPreference.deleteMany({ where: { userId: uid } }).catch(() => {}); await db.user.deleteMany({ where: { id: uid } }).catch(() => {}); }
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Undelivered paid days E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
