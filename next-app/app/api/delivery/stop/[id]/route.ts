/* POST /api/delivery/stop/[id] — the signed-in executive updates ONE of their
   own stops: progress the status, record the completed delivery (bottles in,
   notes → also writes the customer's BottleLedger RETURNED entry), or report
   an issue. A delivery not assigned to this executive's Driver record is 403. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { notify, notifyOutForDelivery, notifyDelivered } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const ISSUE_MAP: Record<string, "CUSTOMER_UNAVAILABLE" | "WRONG_ADDRESS" | "DAMAGED_BOTTLE" | "PAYMENT_ISSUE" | "PRODUCT_ISSUE" | "DELIVERY_FAILED"> = {
  "Customer unavailable": "CUSTOMER_UNAVAILABLE", "Wrong address": "WRONG_ADDRESS", "Damaged bottle": "DAMAGED_BOTTLE",
  "Payment issue": "PAYMENT_ISSUE", "Product issue": "PRODUCT_ISSUE", "Delivery failed": "DELIVERY_FAILED",
};

const Body = z.object({
  action: z.enum(["status", "deliver", "issue"]),
  status: z.enum(["onway", "reached"]).optional(),
  bottles: z.number().int().min(0).max(50).optional(),
  notes: z.string().trim().max(400).optional(),
  issueType: z.string().max(40).optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  comments: z.string().trim().max(500).optional(),
});

export const POST = route("delivery.stop", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  const role = readRole(req);
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");
  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, select: { id: true } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const body = await parseBody(req, Body);
  const delivery = await db.delivery.findFirst({
    where: { id: params.id, driverId: driver.id },
    include: { subscription: { select: { userId: true, addressId: true } }, order: { select: { userId: true } } },
  });
  if (!delivery) throw Errors.forbidden("That stop isn't on your route.");
  const ctx = reqContext(req);

  const custId = delivery.subscription?.userId ?? delivery.order?.userId ?? null;

  if (body.action === "status") {
    const next = body.status === "reached" ? "REACHED" : "ON_THE_WAY";
    await db.delivery.update({ where: { id: delivery.id }, data: { status: next } });
    // Tell the customer their milk is en route (only on the first en-route flip, not on "reached").
    if (next === "ON_THE_WAY" && delivery.status !== "ON_THE_WAY" && custId) {
      try { await notifyOutForDelivery(custId); } catch { /* non-blocking */ }
    }
    return ok({ status: body.status });
  }

  if (body.action === "deliver") {
    if (delivery.status === "DELIVERED") return ok({ status: "delivered", idempotent: true });
    const bottles = body.bottles ?? 0;
    // Pin the address this delivery was actually made to (history snapshot), so a
    // later address change never rewrites this completed delivery's address.
    const snapshotAddressId = delivery.addressId ?? delivery.subscription?.addressId ?? null;
    await db.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: "DELIVERED", deliveredAt: new Date(), bottlesIn: bottles, customerRemark: body.notes || null, addressId: snapshotAddressId },
      });
      if (bottles > 0 && custId) {
        await tx.bottleLedger.create({
          data: { userId: custId, deliveryId: delivery.id, event: "RETURNED", qty: bottles, note: "Collected by delivery executive" },
        });
      }
    });
    await audit({ userId, actorRole: role, action: "delivery.completed", target: `${delivery.id} bottles=${bottles}`, ctx });
    if (custId) { try { await notifyDelivered(custId, { bottles }); } catch { /* non-blocking */ } }
    // Review request — fire ONCE per order/subscription, on its FIRST completed delivery,
    // so a daily subscription never prompts every day.
    if (custId) {
      try {
        const scope = delivery.subscriptionId ? { subscriptionId: delivery.subscriptionId } : delivery.orderId ? { orderId: delivery.orderId } : null;
        if (scope) {
          const deliveredCount = await db.delivery.count({ where: { ...scope, status: "DELIVERED" } });
          if (deliveredCount === 1) {
            await notify(custId, {
              title: "How was your milk? 🥛",
              body: "Your delivery is complete — rate it in a tap and help other families discover fresh A2 milk. Open My Orders to leave a quick review.",
              email: true, emailSubject: "Rate your DOODLY delivery 🥛",
            });
          }
        }
      } catch { /* non-blocking */ }
    }
    return ok({ status: "delivered", bottles });
  }

  // issue
  const type = ISSUE_MAP[body.issueType ?? ""] ?? "DELIVERY_FAILED";
  const prio = (body.priority ?? "Medium").toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
  const issue = await db.deliveryIssue.create({
    data: { deliveryId: delivery.id, driverId: driver.id, type, priority: prio, comments: body.comments || null },
  });
  await audit({ userId, actorRole: role, action: "delivery.issue", target: `${delivery.id} ${type}`, ctx });
  return ok({ issueId: issue.id });
});
