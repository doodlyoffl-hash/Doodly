/* POST /api/admin/inventory/adjust — adjust a variant's or supply item's stock
   (inventory:adjust — a FULL-level special). Requires a reason; audited; can't
   drive stock negative. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { adjustStock } from "@/lib/inventory/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["variant", "material"]),
  id: z.string().min(1),
  mode: z.enum(["set", "increase", "decrease", "damaged", "returned", "correction"]),
  quantity: z.number().int().min(0).max(1_000_000),
  reason: z.string().min(1).max(300),
});

export const POST = route("admin.inventory.adjust", async (req: NextRequest) => {
  const role = requirePermission(req, "inventory", "adjust");
  const body = await parseBody(req, schema);
  const res = await adjustStock(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: `inventory.adjust.${body.mode}`, target: res.id, ctx: reqContext(req) });
  return ok({ result: res });
});
