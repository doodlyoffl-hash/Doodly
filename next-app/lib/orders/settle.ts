/* =============================================================
   DOODLY — settleOrderPaid: the ONE post-payment settlement path.

   Shared by every "money confirmed" trigger so they behave identically and
   idempotently: the Razorpay `payment.captured` webhook (gateway checkout) AND
   the `payment_link.paid` webhook (assisted-order Payment Links). The caller
   must have already flipped the Payment row to PAID; this flips the ORDER to
   PAID exactly once and fires the downstream effects (customer + ops
   confirmation, referral, trial cashback, loyalty, invoice, delivery bridge,
   stock commit, ledger sync). Every effect is individually idempotent.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { syncFromOrderPayment } from "@/lib/payments/service";
import { maybeAwardReferralForUser } from "@/lib/referrals/service";
import { notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { awardOrderPaid } from "@/lib/loyalty/service";
import { ensureInvoiceForOrder } from "@/lib/orders/service";
import { ensureDeliveryForOrder } from "@/lib/orders/delivery-bridge";
import { commitOrderStock } from "@/lib/inventory/order-stock";

const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

/** Settle a confirmed order. `op` is the Payment row (id + owner + order) already
 *  marked PAID. Returns the ledger entry id (or null). Safe on webhook replays. */
export async function settleOrderPaid(op: { id: string; userId: string; orderId: string }): Promise<string | null> {
  // Flip the order to PAID (idempotent) and confirm the customer exactly once —
  // whichever trigger wins the race fires the notification.
  const flip = await db.order.updateMany({ where: { id: op.orderId, status: { not: "PAID" } }, data: { status: "PAID" } }).catch(() => ({ count: 0 }));
  if (flip.count > 0) {
    try { await notifyOrderConfirmed(op.userId, { number: num(op.orderId) }); } catch { /* non-blocking */ }
    try { const { notifyNewOrder } = await import("@/lib/ops/events"); await notifyNewOrder(op.orderId); } catch { /* non-blocking */ }
  }
  // referral reward — credit the referrer if this buyer now has a qualifying subscription (idempotent)
  await maybeAwardReferralForUser(op.userId, { actorRole: "system" });
  // Trial-Pack → subscription cashback (idempotent; only credits an eligible upgrade)
  try { const { creditTrialCashback } = await import("@/lib/wallet/service"); await creditTrialCashback({ userId: op.userId, actorRole: "system" }); } catch (e) { console.error("trial.cashback.settle", (e as Error)?.message); }
  // Pure Rewards: order + subscription points (idempotent)
  await awardOrderPaid(op.userId, op.orderId);
  // Invoice (idempotent), Order→Delivery bridge (idempotent), stock decrement (idempotent).
  try { await ensureInvoiceForOrder(op.orderId); } catch (e) { console.error("invoice.ensure", (e as Error)?.message); }
  try { await ensureDeliveryForOrder(op.orderId); } catch (e) { console.error("delivery.ensure", (e as Error)?.message); }
  try { await commitOrderStock(op.orderId); } catch (e) { console.error("stock.commit", (e as Error)?.message); }
  return await syncFromOrderPayment(op.id).catch(() => null);
}
