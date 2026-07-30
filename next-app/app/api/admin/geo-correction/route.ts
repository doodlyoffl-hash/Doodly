/* POST /api/admin/geo-correction — operations / super-admin correct a customer's GPS
   pin from the back office (by addressId). Skips the field-only shift/assignment gates
   but still enforces serviceable + pin↔pincode. Only coordinates change. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId, requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { applyGeoCorrection } from "@/lib/geo/correction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  addressId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  reason: z.string().trim().max(300).optional(),
  clientId: z.string().trim().min(6).max(80).optional(),
  preview: z.boolean().optional(),
});

export const POST = route("admin.geoCorrection", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = requirePermission(req, "geoCorrection", "edit");
  const body = await parseBody(req, Body);

  const result = await applyGeoCorrection(
    {
      addressId: body.addressId,
      device: { lat: body.lat, lng: body.lng, accuracyM: null, capturedAt: null },
      actor: { userId, role, driverId: null, execEmployeeId: null },
      source: "ADMIN",
      reason: body.reason ?? null,
      clientId: body.clientId ?? null,
      ctx: reqContext(req),
    },
    { dryRun: !!body.preview },
  );
  return ok(result);
});
