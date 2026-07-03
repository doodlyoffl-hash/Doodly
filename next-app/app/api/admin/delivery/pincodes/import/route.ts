/* POST /api/admin/delivery/pincodes/import — bulk CSV import (upsert by pincode).
   RBAC: serviceableAreas:create. Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { importPincodes } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  rows: z.array(z.object({
    pincode: z.string().optional(),
    area: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zoneId: z.string().nullable().optional(),
  })).min(1).max(5000),
});

export const POST = route("admin.delivery.pincodes.import", async (req: NextRequest) => {
  const role = requirePermission(req, "serviceableAreas", "create");
  const body = await parseBody(req, schema);
  const res = await importPincodes(body.rows, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.pincode.import", target: `+${res.created}/~${res.updated}/skip ${res.skipped}`, ctx: reqContext(req) });
  return ok(res);
});
