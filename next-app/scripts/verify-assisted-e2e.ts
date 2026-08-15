/* =============================================================
   DOODLY — Assisted-order END-TO-END verification (SELF-CLEANING).

   Places ONE real assisted order through the production placeOrder() engine
   (payment-link path → order left in its real PENDING "awaiting payment" state)
   and asserts the full new flow, THEN hard-deletes every test-scoped row and
   verifies ZERO residue. Chosen deliberately: at placement NOTHING shared is
   mutated (no stock decrement, no invoice number consumed, no loyalty/delivery —
   those fire only on PAID), so the footprint is fully reversible. A null-contact
   test customer means zero notifications go out (ours or Razorpay's).

   Run:  npx tsx scripts/verify-assisted-e2e.ts   (from next-app/)
   ============================================================= */
import { db } from "@/lib/db";
import { placeOrder } from "@/lib/checkout/service";
import Razorpay from "razorpay";

const TAG = "ZZZ_E2E_ASSIST_DELETE_ME";
const WAREHOUSE = { lat: 16.50862464703653, lng: 80.61739648666206 };
const log = (s: string) => console.log(s);

async function main() {
  // belt-and-suspenders: blank any notification provider so nothing external can send
  ["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "MSG91_AUTH_KEY", "MSG91_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "GUPSHUP_API_KEY"].forEach((k) => { if (process.env[k]) process.env[k] = ""; });

  let userId = "", orderId = "", linkId = "";
  let failed = false;
  try {
    const sp = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true, area: true, city: true, state: true } });
    if (!sp) throw new Error("No serviceable pincode configured — cannot build a deliverable address.");
    log(`1. serviceable pincode: ${sp.pincode} (${sp.city ?? ""})`);

    const user = await db.user.create({ data: { name: `${TAG}_${Date.now()}`, role: "CUSTOMER", email: null, phone: null } });
    userId = user.id;
    log(`2. test customer created: ${userId} (no email/phone → zero external notifications)`);

    const addr = await db.address.create({
      data: { userId, label: "E2E", line1: "E2E test address", city: sp.city ?? "Vijayawada", pincode: sp.pincode, area: sp.area ?? null, state: sp.state ?? null, lat: WAREHOUSE.lat, lng: WAREHOUSE.lng, verified: true, verifiedAt: new Date(), serviceable: true, isDefault: true },
    });
    log(`3. deliverable address created: ${addr.id} (verified + serviceable + at warehouse → passes the checkout gate)`);

    const variantsBefore = await db.variant.findMany({ select: { id: true, stock: true, reservedStock: true } });

    const ctx = { ip: "127.0.0.1", device: "e2e-script", browser: "e2e-script" } as never;
    const res = await placeOrder(userId, { variantId: "v1000", planId: "p7", bottles: 1, address: { id: addr.id } }, ctx, { source: "assisted", actorId: "e2e-script", actorRole: "admin", consentAt: new Date() }) as Record<string, unknown>;
    orderId = String(res.orderId ?? "");
    linkId = String(res.paymentLinkId ?? "");
    log(`4. placeOrder → ${res.number} · method=${res.method} · paid=${res.paid} · link=${res.paymentLink ? "sent" : "none"}`);

    // ---- assertions ----
    const ok: string[] = [], bad: string[] = [];
    const A = (cond: boolean, msg: string) => (cond ? ok : bad).push(msg);
    A(res.method === "link" && res.paid === false, "returns a Razorpay payment link, unpaid");
    A(typeof res.paymentLink === "string" && /^https?:\/\//.test(String(res.paymentLink)), "payment link is a real https URL");
    A(!!linkId && linkId.startsWith("plink_"), "Razorpay payment-link id present (plink_…)");

    const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true, source: true, placedById: true, placedByRole: true, assistConsentAt: true, totalPaise: true, subscription: { select: { id: true, status: true } } } });
    A(order?.status === "PENDING", "order is PENDING (never marked paid until the link is paid)");
    A(order?.source === "assisted", "order.source = assisted");
    A(order?.placedById === "e2e-script" && order?.placedByRole === "admin", "staff actor recorded on the order");
    A(!!order?.assistConsentAt, "consent timestamp recorded");
    A(!!order?.subscription?.id, "subscription created (ACTIVE) from the plan");

    const pay = await db.payment.findFirst({ where: { orderId }, select: { status: true, method: true, razorpayLinkId: true } });
    A(pay?.status === "PENDING" && pay?.razorpayLinkId === linkId, "payment row PENDING with the razorpay link id");

    A(!(await db.invoice.findFirst({ where: { orderId } })), "NO invoice yet (only generated on payment)");
    A(!(await db.delivery.findFirst({ where: { orderId } })), "NO delivery yet (only on payment)");
    A((await db.auditLog.count({ where: { userId, action: { in: ["order.assisted.placed", "order.assisted.link"] } } })) >= 1, "assisted-order audit trail written");

    const variantsAfter = await db.variant.findMany({ select: { id: true, stock: true, reservedStock: true } });
    const stockMoved = variantsAfter.some((va) => { const b = variantsBefore.find((x) => x.id === va.id); return b && (b.stock !== va.stock || b.reservedStock !== va.reservedStock); });
    A(!stockMoved, "inventory stock UNCHANGED (no decrement until paid)");

    log(`5. assertions: ${ok.length} passed${bad.length ? `, ${bad.length} FAILED` : ""}`);
    ok.forEach((m) => log(`   ✓ ${m}`));
    bad.forEach((m) => log(`   ✗ ${m}`));
    if (bad.length) { failed = true; }
  } catch (e) {
    failed = true;
    log(`ERROR during test: ${(e as Error).message}`);
  } finally {
    // ---- CLEANUP (userId-driven → also cleans a partially-created order) + residue check ----
    log("6. cleanup…");
    if (linkId) {
      try { const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID as string, key_secret: process.env.RAZORPAY_KEY_SECRET as string }); await (rzp as unknown as { paymentLink: { cancel(id: string): Promise<unknown> } }).paymentLink.cancel(linkId); log(`   ✓ cancelled Razorpay payment link ${linkId}`); }
      catch (e) { log(`   • Razorpay link cancel: ${(e as Error).message} (link is unpaid → harmless, expires on its own)`); }
    }
    if (userId) {
      const oids = (await db.order.findMany({ where: { userId }, select: { id: true } })).map((o) => o.id);
      const sids = (await db.subscription.findMany({ where: { userId }, select: { id: true } })).map((s) => s.id);
      await db.payment.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.invoice.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.delivery.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: sids } } }).catch(() => {});
      await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: sids } } }).catch(() => {});
      await db.subscription.deleteMany({ where: { userId } }).catch(() => {});
      await db.orderItem.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.orderEvent.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.order.deleteMany({ where: { userId } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { userId } }).catch(() => {});
      await db.walletTxn.deleteMany({ where: { userId } }).catch(() => {});
      await db.loyaltyLedger.deleteMany({ where: { userId } }).catch(() => {});
      await db.bottleLedger.deleteMany({ where: { userId } }).catch(() => {});
      await db.customerEvent.deleteMany({ where: { userId } }).catch(() => {});
      await db.address.deleteMany({ where: { userId } }).catch(() => {});
      await db.user.delete({ where: { id: userId } }).catch((e) => log(`   • user delete: ${(e as Error).message}`));

      const residue = {
        user: await db.user.count({ where: { id: userId } }),
        orders: await db.order.count({ where: { userId } }),
        subscriptions: await db.subscription.count({ where: { userId } }),
        addresses: await db.address.count({ where: { userId } }),
        audit: await db.auditLog.count({ where: { userId } }),
        notifications: await db.notification.count({ where: { userId } }),
      };
      const total = Object.values(residue).reduce((a, b) => a + b, 0);
      log(`   residue: ${JSON.stringify(residue)} → ${total === 0 ? "ZERO ✓ (nothing left in production)" : "NON-ZERO ✗"}`);
      if (total !== 0) failed = true;
    }
    await db.$disconnect();
  }
  log(failed ? "RESULT: FAILED" : "RESULT: PASSED — assisted order placed end-to-end + fully self-cleaned");
  process.exit(failed ? 1 : 0);
}
main();
