/* POST /api/admin/quality/bulk — bulk approve/reject batches (raw-milk inventory
   kept in sync per batch). RBAC: quality:edit. Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { bulkQuality } from "@/lib/quality/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["approve", "reject"]), ids: z.array(z.string().min(1)).min(1).max(1000) });

export const POST = route("admin.quality.bulk", async (req: NextRequest) => {
  const role = requirePermission(req, "quality", "edit");
  const body = await parseBody(req, schema);
  const res = await bulkQuality(body, { actorRole: role });
  await audit({ actorRole: role, action: `quality.bulk.${body.action}`, target: `${res.count} batch(es)`, ctx: reqContext(req) });
  return ok(res);
});
