/* /api/account/address-changes — the signed-in customer's delivery-address changes.
   GET  — list the customer's SCHEDULED + ACTIVE changes.
   POST — schedule an immediate or future-dated change for one or more of the
          customer's own subscriptions (serviceability-enforced server-side). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { listForUser, scheduleChange } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.address-changes.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const changes = await listForUser(userId);
  return ok({ changes });
});

const createSchema = z
  .object({
    subscriptionIds: z.array(z.string().min(1)).min(1, "Pick at least one subscription."),
    newAddressId: z.string().min(1),
    immediate: z.boolean().optional(),
    effectiveDate: z.string().optional(),   // ISO date/datetime; required when not immediate
    note: z.string().trim().max(250).optional(),
  })
  .refine((b) => b.immediate || !!b.effectiveDate, { message: "Pick an effective date, or choose to change immediately.", path: ["effectiveDate"] });

export const POST = route("account.address-changes.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, createSchema);
  const ctx = reqContext(req);
  const actor = { actorId: userId, actorRole: "customer", ip: ctx.ip ?? undefined };

  const scheduled: unknown[] = [];
  const failed: { subscriptionId: string; message: string }[] = [];
  for (const subscriptionId of body.subscriptionIds) {
    try {
      const res = await scheduleChange({
        userId, subscriptionId, newAddressId: body.newAddressId,
        immediate: body.immediate, effectiveDate: body.effectiveDate, note: body.note ?? null, actor, ctx,
      });
      scheduled.push(res.change);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not schedule this change.";
      failed.push({ subscriptionId, message: msg });
    }
  }

  // Nothing scheduled → surface the first failure as the response error.
  if (scheduled.length === 0 && failed.length) throw Errors.badRequest(failed[0].message);
  return ok({ scheduled, failed }, { status: scheduled.length ? 201 : 200 });
});
