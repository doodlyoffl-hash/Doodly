/* /api/admin/delivery/zones — delivery zones (coverage grouping).
   GET  — list with pincode/address/route counts (serviceableAreas:view)
   POST — create zone (serviceableAreas:create), audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listZones, createZone } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.delivery.zones.list", async (req: NextRequest) => {
  requirePermission(req, "serviceableAreas", "view");
  return ok({ zones: await listZones() });
});

const schema = z.object({ name: z.string().min(1).max(80), executive: z.string().max(80).nullable().optional() });

export const POST = route("admin.delivery.zones.create", async (req: NextRequest) => {
  const role = requirePermission(req, "serviceableAreas", "create");
  const body = await parseBody(req, schema);
  const zone = await createZone(body, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.zone.create", target: zone.name, ctx: reqContext(req) });
  return ok({ zone });
});
