/* POST /api/admin/address-changes/[id]/apply — Force Apply a scheduled change
   now (before its effective date). SUPER-ADMIN only. Re-validates serviceability
   unless ?force=1, in which case it applies even to a non-serviceable address
   (staff override for edge cases). */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { applyChange, getChange } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("admin.address-changes.apply", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const role = requirePermission(req, "deliveries", "edit");
  if (role !== "super_admin") throw Errors.forbidden("Only a Super Admin can force-apply a scheduled address change.");

  const ctx = reqContext(req);
  const force = new URL(req.url).searchParams.get("force") === "1";
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: ctx.ip ?? undefined };

  const res = await applyChange(params.id, actor, { force, ctx });
  if (!res.applied) {
    if (res.reason === "not_scheduled") throw Errors.badRequest("This change is not in a schedulable state (already applied or cancelled).");
    if (res.reason === "not_serviceable") throw Errors.badRequest("The new address is not serviceable. Re-apply with force to override.");
  }
  return ok({ change: await getChange(params.id), applied: res.applied });
});
