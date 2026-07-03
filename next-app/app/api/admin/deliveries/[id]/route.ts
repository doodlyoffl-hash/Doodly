/* PATCH /api/admin/deliveries/[id] — staff assigns a driver and/or sets the
   status. Assigning a driver needs the deliveries:assign special; a plain
   status change needs deliveries:edit. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

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
