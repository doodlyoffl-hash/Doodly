/* Backfill: fix already-paid TRIAL orders placed BEFORE the trial→subscription
   fix (a SAMPLE order with no Subscription, so only day-1's delivery exists).
   For each, attach the short "trial" Subscription, re-link the existing day-1
   delivery, and TOP UP the missing deliveries to reach the trial length. Missing
   days are scheduled from today forward (not on already-elapsed dates), so a
   customer delayed by the bug still gets their full count of deliveries.
   Only targets trials whose window is still current/near. Dry-run by default;
   pass --apply to write. Idempotent.
   Run:  npx tsx scripts/backfill-trial-subs.ts [--apply] [--email someone@x] */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const emailArg = (() => { const i = process.argv.indexOf("--email"); return i >= 0 ? process.argv[i + 1] : null; })();
// Delivery dates are IST-midnight (expressed as UTC), matching the app's
// istDayWindow convention — so dedup/anchoring are correct on any server TZ.
const IST_MS = 5.5 * 3600 * 1000;
const istKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);         // IST calendar day
const istMidnight = (d: Date) => { const [y, m, dd] = istKey(d).split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd) - IST_MS); };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => istKey(d);

async function main() {
  const today = istMidnight(new Date());
  const trialVariant = await db.variant.findFirst({ where: { product: { slug: "milk" }, type: "TRIAL" }, select: { id: true, fixedDays: true } });
  const fixedDays = Math.max(1, trialVariant?.fixedDays ?? 3);
  const windowStart = addDays(today, -fixedDays); // ignore trials whose window elapsed long ago

  const orders = await db.order.findMany({
    where: {
      type: "SAMPLE",
      subscription: { is: null },
      OR: [{ status: "PAID" }, { payment: { method: "CASH" } }],
      ...(emailArg ? { user: { email: emailArg } } : {}),
    },
    select: {
      id: true, userId: true, addressId: true, deliveryDate: true, deliverySlot: true, stockUnits: true, createdAt: true,
      user: { select: { email: true, name: true } },
      delivery: { select: { id: true, date: true, status: true, addressId: true, bottleCount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  console.log(`\n=== Trial backfill (${APPLY ? "APPLY" : "DRY-RUN"})${emailArg ? ` · email=${emailArg}` : ""} — trial length ${fixedDays}d, today ${iso(today)} ===\n`);
  let fixed = 0, skipped = 0;

  for (const o of orders) {
    const anchorStart = o.delivery?.date ?? o.deliveryDate;
    const start = anchorStart ? istMidnight(anchorStart) : addDays(today, 1);
    if (start < windowStart) { skipped++; continue; }                       // window elapsed → leave it

    const bottles = Math.max(1, o.delivery?.bottleCount ?? o.stockUnits ?? 1);
    const addressId = o.addressId ?? o.delivery?.addressId ?? (await db.address.findFirst({ where: { userId: o.userId }, orderBy: { isDefault: "desc" }, select: { id: true } }))?.id ?? null;
    if (!addressId) { skipped++; console.log(`SKIP  ${o.user.email}  order ${o.id.slice(-6)} — no address on file`); continue; }

    const existingCount = o.delivery ? 1 : 0;
    const needed = Math.max(0, fixedDays - existingCount);
    // missing days scheduled from today forward (or the future start), skipping any that already exist
    const fillAnchor = start > today ? start : today;
    const haveDays = new Set(o.delivery ? [istKey(o.delivery.date)] : []);
    const toCreate: Date[] = [];
    for (let i = 0; toCreate.length < needed && i < needed + 60; i++) {
      const day = addDays(fillAnchor, i);
      if (haveDays.has(istKey(day))) continue;
      toCreate.push(day);
    }

    const who = `${o.user.name ?? o.user.email} (${o.user.email})`;
    console.log(`FIX   ${who}  order ${o.id.slice(-6)}  ${existingCount} existing + ${toCreate.length} new [${toCreate.map(iso).join(", ")}]`);

    if (APPLY) {
      const trialPlan = await db.plan.upsert({ where: { slug: "trial" }, update: { days: fixedDays }, create: { slug: "trial", name: "Trial Pack", days: fixedDays, discountBps: 0, badge: "Trial", autoRenew: false, active: false }, select: { id: true } });
      const allDays = (o.delivery ? [istMidnight(o.delivery.date)] : []).concat(toCreate).sort((a, b) => a.getTime() - b.getTime());
      const endDate = addDays(allDays[allDays.length - 1] ?? start, 1);
      const nextDeliveryAt = allDays.find((d) => d.getTime() >= today.getTime()) ?? allDays[0] ?? start;
      const sub = await db.subscription.create({
        data: {
          userId: o.userId, planId: trialPlan.id, addressId, orderId: o.id, status: "ACTIVE",
          startDate: allDays[0] ?? start, endDate, deliverySlot: o.deliverySlot ?? "06:00-08:00", nextDeliveryAt, autoRenew: false,
          items: { create: [{ variantId: trialVariant!.id, qty: bottles }] },
        },
        select: { id: true },
      });
      await db.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: "CREATED", summary: `Trial backfilled — ${fixedDays}-day schedule restored`, byRole: "system" } }).catch(() => {});
      if (o.delivery) await db.delivery.update({ where: { id: o.delivery.id }, data: { subscriptionId: sub.id } }).catch(() => {});
      if (toCreate.length) await db.delivery.createMany({ data: toCreate.map((date) => ({ subscriptionId: sub.id, addressId, date, slot: o.deliverySlot ?? "06:00-08:00", status: "SCHEDULED" as const, bottleCount: bottles })) });
    }
    fixed++;
  }

  console.log(`\n${APPLY ? "Fixed" : "Would fix"} ${fixed} trial(s); skipped ${skipped}.`);
  if (!APPLY && fixed > 0) console.log("Re-run with --apply to write.");
}

main().catch((e) => { console.error("backfill error:", (e as Error)?.message); process.exitCode = 1; }).finally(() => db.$disconnect());
