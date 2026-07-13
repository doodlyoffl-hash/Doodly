/* /api/admin/address-changes/[id] — staff edit / cancel of a scheduled change.
   Gated on deliveries:edit. Force-Apply lives at ./[id]/apply (super-admin only). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { editChange, cancelChange } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  cancel: z.boolean().optional(),
  newAddressId: z.string().min(1).optional(),
  immediate: z.boolean().optional(),
  effectiveDate: z.string().optional(),
  note: z.string().trim().max(250).optional(),
});

export const PATCH = route("admin.address-changes.update", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const role = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, patchSchema);
  const ctx = reqContext(req);
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: ctx.ip ?? undefined };

  // No userId scoping → staff act on any customer's change.
  const change = body.cancel
    ? await cancelChange(params.id, actor, { ctx })
    : await editChange(params.id, body, actor, { ctx });
  return ok({ change });
});
