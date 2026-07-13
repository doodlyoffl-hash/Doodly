/* =============================================================
   DOODLY — Order stock commit (filled-bottle inventory).
   Decrement a paid order's Variant.stock exactly once, record the
   movement, and alert admins on low/out-of-stock. The oversell CHECK
   happens at checkout (lib/checkout/service.ts); this is the commit.
   Idempotent + system-callable so the payment webhook/verify/wallet
   paths can all fire it safely (Order.stockCommittedAt is the guard).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { logProductEvent } from "@/lib/products/service";
import { notify } from "@/lib/notifications/dispatch";

async function alertLowStock(v: { label: string; stock: number; lowStockThreshold: number }) {
  if (v.stock > v.lowStockThreshold) return;
  try {
    const admins = await db.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    const body = v.stock <= 0 ? `${v.label} is OUT OF STOCK — restock in Admin → Inventory.` : `${v.label} is low on stock — ${v.stock} left.`;
    for (const a of admins) await notify(a.id, { title: "Inventory alert", body });
  } catch { /* non-blocking */ }
}

export async function commitOrderStock(orderId: string): Promise<{ committed: boolean } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, stockVariantId: true, stockUnits: true, stockCommittedAt: true, payment: { select: { method: true } } },
  });
  if (!order) return null;
  if (order.stockCommittedAt) return { committed: false };            // already decremented (idempotent)
  if (!order.stockVariantId || order.stockUnits <= 0) return null;    // order doesn't track stock
  // Confirmed = prepaid (PAID) OR cash-on-delivery (CASH payment, confirmed at placement).
  if (order.status !== "PAID" && order.payment?.method !== "CASH") return null;

  const result = await db.$transaction(async (tx) => {
    // re-check inside the tx (webhook + verify can race)
    const o = await tx.order.findUnique({ where: { id: orderId }, select: { stockCommittedAt: true, stockVariantId: true, stockUnits: true } });
    if (!o || o.stockCommittedAt || !o.stockVariantId || o.stockUnits <= 0) return null;
    const v = await tx.variant.findUnique({ where: { id: o.stockVariantId }, select: { id: true, label: true, stock: true, lowStockThreshold: true, productId: true } });
    if (!v) { await tx.order.update({ where: { id: orderId }, data: { stockCommittedAt: new Date() } }); return null; }  // variant gone → mark done
    const next = Math.max(0, v.stock - o.stockUnits);                // never negative
    await tx.variant.update({ where: { id: v.id }, data: { stock: next } });
    await tx.order.update({ where: { id: orderId }, data: { stockCommittedAt: new Date() } });
    await logProductEvent(tx, v.productId, "STOCK",
      `Sold ${o.stockUnits} × ${v.label} — stock ${v.stock} → ${next} (order ${orderId.slice(-6).toUpperCase()})`,
      { variantId: v.id, mode: "decrement", from: v.stock, to: next, units: o.stockUnits, orderId }, { actorRole: "system" });
    return { label: v.label, stock: next, lowStockThreshold: v.lowStockThreshold };
  });

  if (result) await alertLowStock(result);
  return { committed: !!result };
}
