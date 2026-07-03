/* /api/admin/delivery/pincodes — serviceable pincode coverage.
   GET  — list + stats (serviceableAreas:view), search/status/zone filters
   POST — add pincode (serviceableAreas:create), audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listPincodes, createPincode } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.delivery.pincodes.list", async (req: NextRequest) => {
  requirePermission(req, "serviceableAreas", "view");
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  return ok(await listPincodes({
    search: sp.get("search") ?? undefined,
    status: status === "active" || status === "inactive" || status === "deleted" ? status : undefined,
    zoneId: sp.get("zoneId") ?? undefined,
  }));
});

const createSchema = z.object({
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
  area: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  state: z.string().max(80).optional(),
  zoneId: z.string().nullable().optional(),
  charge: z.number().int().min(0).max(100000).optional(),
  slot: z.string().max(40).optional(),
  eta: z.string().max(40).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const POST = route("admin.delivery.pincodes.create", async (req: NextRequest) => {
  const role = requirePermission(req, "serviceableAreas", "create");
  const body = await parseBody(req, createSchema);
  const pincode = await createPincode(body, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.pincode.create", target: pincode.pincode, ctx: reqContext(req) });
  return ok({ pincode });
});
