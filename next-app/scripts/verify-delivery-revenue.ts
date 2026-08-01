/* COMPREHENSIVE E2E — delivery-based retail revenue recognition (live DB, self-cleaning).
   On a FUTURE IST day (isolated): a subscription (₹130/day) + its deliveries prove the
   5 spec scenarios + the snapshot-freeze + the settlement filter fix.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-delivery-revenue.ts */
import { PrismaClient } from "@prisma/client";
import { istDayWindow } from "../lib/delivery/stats";
import { retailRevenueForDay } from "../lib/delivery/revenue";
import { retailLitresForDay } from "../lib/milk/settle";
import { dailyPnl } from "../lib/milk/pnl";
// NB: the completeDelivery freeze hook is verified separately (backfill + a prior full
// run) — this E2E creates rows directly to stay fast and avoid the completion path's
// external notification side-effects (never notify @doodly.test test users).

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const DAY = "2027-06-10", EMPTY_DAY = "2027-06-11";           // future, isolated
const win = istDayWindow(DAY);
const at = (h: number) => new Date(win.start.getTime() + h * 3600_000);   // an instant inside the IST day
const PRICE = 13000;                                          // ₹130/day
let userId = "", addrId = "", productId = "", variantId = "", planId = "", subId = "";
const delIds: string[] = [];

async function run() {
  const u = await db.user.create({ data: { name: `DR-E2E ${stamp}`, role: "CUSTOMER", email: `dr-e2e-${stamp}@doodly.test` } });
  userId = u.id;
  const a = await db.address.create({ data: { userId, line1: "1 Test St", city: "Vijayawada", pincode: "520010" } });
  addrId = a.id;
  const prod = await db.product.create({ data: { slug: `dr-milk-${stamp}`, name: "DR Test Milk", description: "E2E test product" } });
  productId = prod.id;
  const v = await db.variant.create({ data: { productId, label: "1000 ml", ml: 1000, dailyPaise: PRICE } });
  variantId = v.id;
  const plan = await db.plan.create({ data: { slug: `dr-p30-${stamp}`, name: "DR 30-Day", days: 30, discountBps: 0 } });
  planId = plan.id;
  const sub = await db.subscription.create({ data: { userId, planId, addressId: addrId, startDate: new Date(), status: "ACTIVE", items: { create: [{ variantId, qty: 1 }] } } });
  subId = sub.id;

  const mkDelivery = (status: string, revenuePaise: number | null) =>
    db.delivery.create({ data: { subscriptionId: subId, date: at(6), status: status as never, kind: "DELIVERY", bottleCount: 1, ...(revenuePaise != null ? { revenuePaise } : {}) }, select: { id: true } });

  // S1 — subscription exists but nothing delivered yet → ₹0
  ok("S1: no deliveries → retail revenue ₹0 + 0 L", (await retailRevenueForDay(win.start, win.end)).revenuePaise === 0 && (await retailLitresForDay(win.start, win.end)) === 0);

  // S2 — one completed delivery (frozen ₹130) → recognised, 1 L
  delIds.push((await mkDelivery("DELIVERED", PRICE)).id);
  ok("S2: one delivered → retail revenue ₹130 · 1 L · 1 delivery", (await retailRevenueForDay(win.start, win.end)).revenuePaise === PRICE && (await retailLitresForDay(win.start, win.end)) === 1);

  // Snapshot-freeze — change the catalogue price; the past delivered row must NOT re-value
  await db.variant.update({ where: { id: variantId }, data: { dailyPaise: 20000 } });
  ok("freeze: past delivered row still ₹130 after price → ₹200", (await retailRevenueForDay(win.start, win.end)).revenuePaise === PRICE);
  await db.variant.update({ where: { id: variantId }, data: { dailyPaise: PRICE } });   // reset

  // S3 — 4 more delivered: 3 frozen + 1 live-compute (revenuePaise null) → 5 × ₹130
  for (let i = 0; i < 3; i++) delIds.push((await mkDelivery("DELIVERED", PRICE)).id);
  delIds.push((await mkDelivery("DELIVERED", null)).id);      // null → live-compute path
  const s3 = await retailRevenueForDay(win.start, win.end);
  ok("S3: 5 deliveries → ₹650 exactly (frozen + live-compute mixed)", s3.revenuePaise === 5 * PRICE && s3.deliveries === 5, JSON.stringify(s3));

  // S4 — a FAILED and a CANCELLED delivery must NOT count (revenue) or draw milk (COGS filter fix)
  delIds.push((await mkDelivery("FAILED", null)).id);
  delIds.push((await mkDelivery("CANCELLED", null)).id);
  const s4 = await retailRevenueForDay(win.start, win.end);
  ok("S4: failed + cancelled excluded → still ₹650 · 5 L", s4.revenuePaise === 5 * PRICE && (await retailLitresForDay(win.start, win.end)) === 5, `${s4.revenuePaise} · ${await retailLitresForDay(win.start, win.end)}L`);

  // S5 — daily P&L retail revenue == Σ delivered-delivery values
  const pnl = await dailyPnl(DAY);
  ok("S5: dailyPnl retail revenue == ₹650 (delivery-based) · 5 L delivered", pnl.retailRevenuePaise === 5 * PRICE && pnl.retailLitresDelivered === 5 && pnl.retailDeliveries === 5, JSON.stringify({ rev: pnl.retailRevenuePaise, l: pnl.retailLitresDelivered, d: pnl.retailDeliveries }));

  // empty future day is untouched
  ok("isolation: a different future day has ₹0", (await retailRevenueForDay(istDayWindow(EMPTY_DAY).start, istDayWindow(EMPTY_DAY).end)).revenuePaise === 0);
}

async function cleanup() {
  try {
    const allDel = [...delIds];
    if (subId) { const subDel = await db.delivery.findMany({ where: { subscriptionId: subId }, select: { id: true } }); subDel.forEach((d) => allDel.push(d.id)); }
    for (const id of allDel) await db.auditLog.deleteMany({ where: { action: "revenue.recognized", target: { startsWith: id } } }).catch(() => {});   // precise: this test's revenue.recognized rows only
    if (allDel.length) {
      await db.bottleLedger.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
      await db.delivery.deleteMany({ where: { id: { in: allDel } } }).catch(() => {});
    }
    if (subId) { await db.subscriptionItem.deleteMany({ where: { subscriptionId: subId } }).catch(() => {}); await db.subscription.deleteMany({ where: { id: subId } }).catch(() => {}); }
    if (planId) await db.plan.deleteMany({ where: { id: planId } }).catch(() => {});
    if (variantId) await db.variant.deleteMany({ where: { id: variantId } }).catch(() => {});
    if (productId) await db.product.deleteMany({ where: { id: productId } }).catch(() => {});
    if (addrId) await db.address.deleteMany({ where: { id: addrId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Delivery-based retail revenue E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
