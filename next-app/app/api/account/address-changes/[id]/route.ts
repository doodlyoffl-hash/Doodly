/* /api/account/address-changes/[id] — edit or cancel one of the customer's own
   scheduled (not-yet-applied) delivery-address changes. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { editChange, cancelChange } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  newAddressId: z.string().min(1).optional(),
  immediate: z.boolean().optional(),
  effectiveDate: z.string().optional(),
  note: z.string().trim().max(250).optional(),
});

export const PATCH = route("account.address-changes.edit", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, patchSchema);
  const ctx = reqContext(req);
  const actor = { actorId: userId, actorRole: "customer", ip: ctx.ip ?? undefined };
  const change = await editChange(params.id, body, actor, { userId, ctx });
  return ok({ change });
});

export const DELETE = route("account.address-changes.cancel", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const userId = requireUserId(req);
  const ctx = reqContext(req);
  const actor = { actorId: userId, actorRole: "customer", ip: ctx.ip ?? undefined };
  const change = await cancelChange(params.id, actor, { userId, ctx });
  return ok({ change });
});
