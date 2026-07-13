/* =============================================================
   DOODLY — retro-bridge backfill.
   Creates the missing Delivery for every CONFIRMED order (prepaid PAID, or
   COD) that has none — e.g. orders placed before checkout captured the
   address/date onto the order. Mirrors lib/orders/delivery-bridge.ts exactly
   (same fallbacks): date = order.deliveryDate ?? next delivery day (IST);
   address = order.addressId ?? the customer's default saved address.
   Idempotent (skips orders that already have a delivery / subscriptions whose
   first delivery exists). Dry-run by default — pass --confirm to write.

   Usage:  node scripts/backfill-deliveries.mjs [--confirm]
   ============================================================= */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const IST_MS = 5.5 * 60 * 60 * 1000;

function nextDeliveryDateIST() {
  const nowIST = new Date(Date.now() + IST_MS);
  const y = nowIST.getUTCFullYear(), m = nowIST.getUTCMonth(), d = nowIST.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1) - IST_MS);
}
function istISO(dt) { const t = new Date(dt.getTime() + IST_MS); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`; }

async function resolveAddressId(orderAddressId, userId) {
  if (orderAddressId) return orderAddressId;
  const a = await db.address.findFirst({ where: { userId }, orderBy: { isDefault: "desc" }, select: { id: true } });
  return a?.id ?? null;
}

try {
  console.log(`Mode: ${CONFIRM ? "WRITE (--confirm)" : "DRY-RUN (no --confirm)"}\n`);

  // Confirmed = PAID, or any payment method CASH (COD is confirmed at placement).
  const orders = await db.order.findMany({
    where: {
      delivery: null,                                   // one-time orders with no delivery
      OR: [{ status: "PAID" }, { payment: { method: "CASH" } }],
    },
    select: {
      id: true, status: true, type: true, addressId: true, deliveryDate: true, deliverySlot: true, userId: true,
      payment: { select: { method: true } },
      subscription: { select: { id: true, addressId: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let created = 0, skippedExisting = 0, skippedNoAddress = 0;
  const rows = [];

  for (const o of orders) {
    const date = o.deliveryDate ?? nextDeliveryDateIST();

    if (o.subscription) {
      const existing = await db.delivery.findFirst({ where: { subscriptionId: o.subscription.id }, select: { id: true } });
      if (existing) { skippedExisting++; continue; }
      const addressId = await resolveAddressId(o.addressId ?? o.subscription.addressId, o.userId);
      if (!addressId) { skippedNoAddress++; rows.push([o.id.slice(-6), o.user?.name, "SUB", "NO-ADDRESS → skip"]); continue; }
      if (CONFIRM) await db.delivery.create({ data: { subscriptionId: o.subscription.id, addressId, date, slot: o.deliverySlot, status: "SCHEDULED", bottleCount: 1 } });
      created++; rows.push([o.id.slice(-6), o.user?.name, "SUB", `→ ${istISO(date)}`]);
      continue;
    }

    const addressId = await resolveAddressId(o.addressId, o.userId);
    if (!addressId) { skippedNoAddress++; rows.push([o.id.slice(-6), o.user?.name, o.type, "NO-ADDRESS → skip"]); continue; }
    if (CONFIRM) await db.delivery.create({ data: { orderId: o.id, addressId, date, slot: o.deliverySlot, status: "SCHEDULED", bottleCount: 1 } });
    created++; rows.push([o.id.slice(-6), o.user?.name, o.type, `${o.payment?.method || "-"} → deliver ${istISO(date)}`]);
  }

  console.log(`Confirmed orders missing a delivery: ${orders.length}`);
  for (const r of rows) console.log("  ", r.map(String).join("  |  "));
  console.log(`\n${CONFIRM ? "Created" : "Would create"}: ${created}   skipped(existing sub delivery): ${skippedExisting}   skipped(no address): ${skippedNoAddress}`);
  if (!CONFIRM) console.log("\nDry-run only. Re-run with --confirm to write these deliveries.");
} finally {
  await db.$disconnect();
}
