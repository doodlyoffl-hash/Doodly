/* PATCH /api/driver/deliveries/[id] — the assigned driver updates one of THEIR
   stops: advance status, record empties collected, cash collected and a remark.
   When a stop becomes DELIVERED we stamp deliveredAt and write the customer's
   bottle ledger (ISSUED for bottles handed over, RETURNED for empties picked up). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const DRIVER_STATUSES = ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED", "FAILED", "SKIPPED"] as const;

const patchSchema = z.object({
  status: z.enum(DRIVER_STATUSES).optional(),
  bottlesIn: z.number().int().min(0).max(99).optional(),
  bottlesOut: z.number().int().min(0).max(99).optional(),
  cashCollected: z.number().int().min(0).optional(),
  customerRemark: z.string().trim().max(200).optional(),
});

export const PATCH = route("driver.delivery.update", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  const driver = await db.driver.findUnique({ where: { userId }, select: { id: true } });
  if (!driver) throw Errors.forbidden("No delivery profile is linked to this account.");

  const body = await parseBody(req, patchSchema);

  const del = await db.delivery.findFirst({
    where: { id: params.id, driverId: driver.id },
    select: { id: true, status: true, bottleCount: true, subscription: { select: { userId: true } }, order: { select: { userId: true } } },
  });
  if (!del) throw Errors.notFound("Delivery not found on your route.");

  const becomingDelivered = body.status === "DELIVERED" && del.status !== "DELIVERED";
  const bottlesOut = body.bottlesOut ?? (becomingDelivered ? del.bottleCount : undefined);

  const delivery = await db.delivery.update({
    where: { id: del.id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.bottlesIn !== undefined ? { bottlesIn: body.bottlesIn } : {}),
      ...(bottlesOut !== undefined ? { bottlesOut } : {}),
      ...(body.cashCollected !== undefined ? { cashCollected: body.cashCollected } : {}),
      ...(body.customerRemark !== undefined ? { customerRemark: body.customerRemark } : {}),
      ...(becomingDelivered ? { deliveredAt: new Date() } : {}),
    },
    select: { id: true, status: true, bottlesIn: true, bottlesOut: true, cashCollected: true, customerRemark: true, deliveredAt: true },
  });

  // On first delivery, post the customer's bottle ledger.
  if (becomingDelivered) {
    const custId = del.subscription?.userId ?? del.order?.userId;
    if (custId) {
      const out = bottlesOut ?? del.bottleCount;
      const inn = body.bottlesIn ?? 0;
      if (out > 0) await db.bottleLedger.create({ data: { userId: custId, deliveryId: del.id, event: "ISSUED", qty: out } });
      if (inn > 0) await db.bottleLedger.create({ data: { userId: custId, deliveryId: del.id, event: "RETURNED", qty: inn } });
    }
  }

  await audit({ userId, actorRole: "delivery_executive", action: `delivery.${body.status?.toLowerCase() ?? "update"}`, target: del.id, ctx: reqContext(req) });
  return ok({ delivery });
});
