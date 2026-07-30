/* POST /api/delivery/geo-correction — the signed-in delivery executive corrects a
   customer's GPS pin from their current device location while at the door. Gated by
   the geoCorrection permission + shift/assignment/accuracy/pincode checks in the
   service. `preview:true` evaluates without writing (for the confirm screen).
   Only the coordinates change — never the address text. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId, requirePermission } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { applyGeoCorrection } from "@/lib/geo/correction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  deliveryId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).optional(),
  capturedAt: z.string().datetime().optional(),
  reason: z.string().trim().max(300).optional(),
  clientId: z.string().trim().min(6).max(80).optional(),
  preview: z.boolean().optional(),
});

const STALE_MS = 2 * 60 * 1000; // a fix captured >2 min ago is treated as an offline sync

export const POST = route("delivery.geoCorrection", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = requirePermission(req, "geoCorrection", "edit");
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");
  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, select: { id: true, employeeId: true } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const body = await parseBody(req, Body);
  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : null;
  const stale = capturedAt ? Date.now() - capturedAt.getTime() > STALE_MS : false;

  const result = await applyGeoCorrection(
    {
      deliveryId: body.deliveryId,
      device: { lat: body.lat, lng: body.lng, accuracyM: body.accuracyM ?? null, capturedAt },
      actor: { userId, role, driverId: driver.id, execEmployeeId: driver.employeeId },
      source: stale ? "OFFLINE_SYNC" : "EXEC_GPS",
      reason: body.reason ?? null,
      clientId: body.clientId ?? null,
      ctx: reqContext(req),
    },
    { dryRun: !!body.preview },
  );
  return ok(result);
});
