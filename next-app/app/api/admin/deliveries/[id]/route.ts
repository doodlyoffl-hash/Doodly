/* PATCH /api/admin/deliveries/[id] — staff assigns a driver and/or sets the
   status. Assigning a driver needs the deliveries:assign special; a plain
   status change needs deliveries:edit. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { ADJUST_REASONS } from "@/lib/subscriptions/reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  driverId: z.string().min(1).nullable().optional(),
  status: z.enum(["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED", "FAILED", "SKIPPED"]).optional(),
});

export const PATCH = route("admin.deliveries.update", async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, patchSchema);

  if (!(await db.delivery.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Delivery not found.");

  if (body.driverId !== undefined) {
    requirePermission(req, "deliveries", "assign"); // assigning is a FULL-level special
    if (body.driverId && !(await db.driver.findUnique({ where: { id: body.driverId }, select: { id: true } }))) {
      throw Errors.badRequest("That driver does not exist.");
    }
  }

  const delivery = await db.delivery.update({
    where: { id: params.id },
    data: {
      ...(body.driverId !== undefined ? { driverId: body.driverId, ...(body.driverId && body.status === undefined ? { status: "ASSIGNED" } : {}) } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    select: { id: true, status: true, driverId: true },
  });

  await audit({ actorRole: actor, action: body.driverId !== undefined ? "delivery.assign" : "delivery.update", target: delivery.id, ctx: reqContext(req) });
  return ok({ delivery });
});

/* POST — Adjust a MISSED subscription delivery (mark FAILED + reason → made up at the
   end, subscription extends) or Reinstate a cancelled/missed one. Subscription
   deliveries only. */
const adjustSchema = z.object({
  action: z.enum(["adjust", "reinstate"]),
  reason: z.enum(ADJUST_REASONS).optional(),
  note: z.string().max(300).optional(),
});

export const POST = route("admin.deliveries.adjust", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, adjustSchema);
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role };

  let result: unknown;
  if (body.action === "adjust") {
    const { adjustMissedDelivery } = await import("@/lib/subscriptions/deliveries");
    result = await adjustMissedDelivery(params.id, body.reason ?? "OPS_MISSED", body.note, actor);
    if (!result) throw Errors.badRequest("This delivery isn't part of a subscription.");
  } else {
    const { reinstateDelivery } = await import("@/lib/subscriptions/deliveries");
    result = await reinstateDelivery(params.id, actor);
    if (!result) throw Errors.badRequest("Nothing to reinstate for this delivery.");
  }

  await audit({ actorRole: role, action: `delivery.${body.action}`, target: params.id, ctx: reqContext(req) });
  return ok({ result });
});
