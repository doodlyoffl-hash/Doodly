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
import { notifyOutForDelivery } from "@/lib/notifications/dispatch";
import { completeDelivery, setDeliveryOutcome } from "@/lib/delivery/complete";
import { actualLegKmBetween } from "@/lib/delivery/gps-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const ISSUE_MAP: Record<string, "CUSTOMER_UNAVAILABLE" | "WRONG_ADDRESS" | "DAMAGED_BOTTLE" | "PAYMENT_ISSUE" | "PRODUCT_ISSUE" | "DELIVERY_FAILED"> = {
  "Customer unavailable": "CUSTOMER_UNAVAILABLE", "Wrong address": "WRONG_ADDRESS", "Damaged bottle": "DAMAGED_BOTTLE",
  "Payment issue": "PAYMENT_ISSUE", "Product issue": "PRODUCT_ISSUE", "Delivery failed": "DELIVERY_FAILED",
};

const Body = z.object({
  action: z.enum(["status", "deliver", "issue", "outcome"]),
  status: z.enum(["onway", "reached"]).optional(),
  bottles: z.number().int().min(0).max(50).optional(),        // empties collected (RETURNED)
  bottlesOut: z.number().int().min(0).max(50).optional(),     // bottles handed over (partial < planned)
  partial: z.boolean().optional(),                            // PARTIALLY_DELIVERED when only some handed over
  execRemark: z.string().trim().max(400).optional(),         // the executive's own note
  notes: z.string().trim().max(400).optional(),
  outcome: z.enum(["unavailable", "reschedule", "cancel"]).optional(),
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
    // Stamp the arrival time once (delivery timeline) — first REACHED wins, never overwritten.
    const stampReached = next === "REACHED" && !delivery.reachedAt;
    // First "On the way" flip: stamp the timeline start + arm a fresh geofence dwell clock so the
    // auto-"Reached Customer" detector (POST /api/delivery/track) can take over from here.
    const startOnway = next === "ON_THE_WAY" && delivery.status !== "ON_THE_WAY";
    await db.delivery.update({
      where: { id: delivery.id },
      data: {
        status: next,
        ...(stampReached ? { reachedAt: new Date() } : {}),
        ...(startOnway ? { onThewayAt: delivery.onThewayAt ?? new Date(), geofenceEnteredAt: null } : {}),
      },
    });
    // Tell the customer their milk is en route (only on the first en-route flip, not on "reached").
    if (startOnway && custId) {
      try { await notifyOutForDelivery(custId); } catch { /* non-blocking */ }
    }
    return ok({ status: body.status });
  }

  if (body.action === "deliver") {
    if (delivery.status === "DELIVERED" || delivery.status === "PARTIALLY_DELIVERED") return ok({ status: "delivered", idempotent: true });
    const bottles = body.bottles ?? 0;
    const partial = !!body.partial;
    // Single source of truth for the full completion side-effects (ledger ISSUED+RETURNED,
    // loyalty, delivered notification, one-time review request, address snapshot).
    await completeDelivery(delivery.id, {
      bottlesIn: bottles,
      bottlesOut: body.bottlesOut,                 // partial handover (undefined → full bottleCount)
      customerRemark: body.notes || null,
      execRemark: body.execRemark || null,
      status: partial ? "PARTIALLY_DELIVERED" : "DELIVERED",
    });
    await audit({ userId, actorRole: role, action: partial ? "delivery.partial" : "delivery.completed", target: `${delivery.id} out=${body.bottlesOut ?? "full"} in=${bottles}`, ctx });
    // Delivery timeline: stamp the GPS distance of the leg that ended at this stop
    // (previous stop's departure → this arrival). Best-effort; only when a tracked shift exists.
    try {
      const shift = await db.shift.findFirst({ where: { driverId: driver.id, status: "OPEN" }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true } });
      if (shift) {
        const t = await db.delivery.findUnique({ where: { id: delivery.id }, select: { reachedAt: true, deliveredAt: true } });
        const to = t?.reachedAt ?? t?.deliveredAt ?? new Date();
        const prev = await db.delivery.findFirst({ where: { driverId: driver.id, id: { not: delivery.id }, deliveredAt: { not: null, lt: to } }, orderBy: { deliveredAt: "desc" }, select: { deliveredAt: true } });
        const from = prev?.deliveredAt ?? shift.startedAt;
        const legKm = await actualLegKmBetween(shift.id, from, to);
        if (legKm > 0) await db.delivery.update({ where: { id: delivery.id }, data: { actualLegKm: legKm } });
      }
    } catch { /* timeline is non-blocking */ }
    return ok({ status: partial ? "partial" : "delivered", bottles });
  }

  if (body.action === "outcome") {
    if (!body.outcome) throw Errors.badRequest("Missing outcome.");
    // unavailable / reschedule → subscription make-up; cancel → forfeit. Detaches + re-optimises.
    const result = await setDeliveryOutcome(delivery.id, body.outcome, { execRemark: body.execRemark || null, actorId: userId, actorRole: role });
    await audit({ userId, actorRole: role, action: `delivery.${body.outcome}`, target: `${delivery.id}${body.execRemark ? " · " + body.execRemark.slice(0, 60) : ""}`, ctx });
    return ok({ outcome: body.outcome, result });
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
