/* /api/admin/deliveries/packing — the packing workflow board + advance action.
   GET  → deliveries needing packing for a given IST day (?date=YYYY-MM-DD,
          default today), grouped by stage (deliveries:view).
   POST → advance one ({ id, status }) or many ({ ids, status }) (deliveries:edit). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { packingBoard, advancePacking, bulkAdvancePacking, PACKING_STAGES } from "@/lib/delivery/packing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.packing.board", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const date = new URL(req.url).searchParams.get("date");
  return ok(await packingBoard(date));
});

const postSchema = z.object({
  id: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1).optional(),
  status: z.enum(PACKING_STAGES as [string, ...string[]]),
}).refine((b) => b.id || (b.ids && b.ids.length), { message: "Provide an id or ids." });

export const POST = route("admin.deliveries.packing.advance", async (req: NextRequest) => {
  const role = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, postSchema);
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ctx: reqContext(req) };
  const status = body.status as (typeof PACKING_STAGES)[number];

  const result = body.ids && body.ids.length
    ? await bulkAdvancePacking(body.ids, status, actor)
    : await advancePacking(body.id!, status, actor);
  return ok(result);
});
