/* =============================================================
   DOODLY B2B — delivery-based revenue recognition.

   Mirrors the retail pipeline (completeDelivery → freeze Delivery.revenuePaise →
   settleDay) onto the B2B "→ DELIVERED" transition. A B2B order books ZERO
   Profit-Centre revenue until it is actually marked DELIVERED; at that moment we
   FREEZE the net-of-GST revenue + a deliveredAt timestamp on the order (immutable
   thereafter — corrections are BusinessRevenueAdjustment rows), then trigger the
   shared FIFO settlement for that IST day so B2B milk COGS draws in lockstep.

   Revenue basis (user-approved): NET of GST = totalPaise − taxPaise. Recognition
   day: the actual delivery day (deliveredAt's IST day), not the scheduled date.
   ============================================================= */
import "server-only";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/auth/audit";

/** Net-of-GST recognised revenue for a B2B order (GST is a pass-through liability,
 *  never income — consistent with the retail net basis). */
export function b2bNetRevenuePaise(order: { totalPaise: number; taxPaise: number }): number {
  return Math.max(0, order.totalPaise - order.taxPaise);
}

type RecogOrder = {
  id: string; businessId: string; totalPaise: number; taxPaise: number;
  revenuePaise: number | null;
  items?: { productName: string; quantity: number; unit: string }[];
};

/** Freeze revenue recognition for a B2B order INSIDE the caller's transaction, at the
 *  moment it becomes DELIVERED. Idempotent: if revenuePaise is already stamped it is a
 *  no-op (returns recognised:false) so re-flips / retries never double-recognise.
 *  Returns the frozen figures for the post-commit settle + audit. */
export async function freezeB2BRecognition(
  tx: Prisma.TransactionClient, order: RecogOrder, now = new Date(),
): Promise<{ recognised: boolean; revenuePaise: number; deliveredAt: Date; businessId: string }> {
  if (order.revenuePaise != null) {
    // already recognised earlier — do not move the frozen figure
    const existing = await tx.businessOrder.findUnique({ where: { id: order.id }, select: { deliveredAt: true } });
    return { recognised: false, revenuePaise: order.revenuePaise, deliveredAt: existing?.deliveredAt ?? now, businessId: order.businessId };
  }
  const revenuePaise = b2bNetRevenuePaise(order);
  await tx.businessOrder.update({ where: { id: order.id }, data: { revenuePaise, deliveredAt: now } });
  return { recognised: true, revenuePaise, deliveredAt: now, businessId: order.businessId };
}

const summariseItems = (items?: { productName: string; quantity: number; unit: string }[]) =>
  (items ?? []).map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join(", ").slice(0, 240);

/** Trigger the shared daily milk settlement for a B2B delivery's IST day (best-effort,
 *  never blocks the caller) + write the recognition audit row. Call AFTER the recognition
 *  transaction has committed — exactly like retail completeDelivery's auto-settle. */
export async function onB2BDelivered(args: {
  orderId: string; orderCode?: string; businessId: string; revenuePaise: number; deliveredAt: Date;
  items?: { productName: string; quantity: number; unit: string }[];
  invoiceNumber?: string | null; actorId?: string; actorRole?: string;
}) {
  // 1) settle that day's milk COGS (FIFO), so B2B inventory + COGS draw on delivery
  try {
    const { settleDay } = await import("@/lib/milk/settle");
    const { istISO } = await import("@/lib/delivery/stats");
    await settleDay(istISO(args.deliveredAt), { actorRole: "system", actorId: "auto:b2b-delivered", quiet: true });
  } catch { /* non-blocking — the next settle (retail completion or manual) reconciles the day */ }

  // 2) audit the recognition with full traceability (order, invoice, business, ₹, qty/unit, ts, actor)
  await audit({
    userId: null, actorRole: args.actorRole ?? "system",
    action: "b2b.delivery.recognized",
    target: `order ${args.orderCode ?? args.orderId} · biz ${args.businessId} · revenue ₹${(args.revenuePaise / 100).toFixed(2)} (net) · ${summariseItems(args.items) || "—"}${args.invoiceNumber ? ` · inv ${args.invoiceNumber}` : ""} · ${args.deliveredAt.toISOString()}${args.actorId ? ` · by ${args.actorId}` : ""}`,
  }).catch(() => {});
}

/** Record an immutable post-delivery revenue reversal (cancellation / refund of an
 *  already-recognised order) INSIDE the caller's tx. Never edits the frozen order row.
 *  Returns the litres to unwind so the caller can re-settle the original delivered day. */
export async function recordRevenueAdjustment(
  tx: Prisma.TransactionClient,
  args: { order: { id: string; businessId: string; revenuePaise: number | null; deliveredAt: Date | null }; type: "CANCELLATION" | "REFUND"; amountPaise: number; reason?: string; actorId?: string; actorRole?: string },
) {
  await tx.businessRevenueAdjustment.create({
    data: {
      businessOrderId: args.order.id, businessId: args.order.businessId, type: args.type,
      amountPaise: args.amountPaise, reason: args.reason ?? null,
      createdById: args.actorId ?? null, createdByRole: args.actorRole ?? null,
    },
  });
}
