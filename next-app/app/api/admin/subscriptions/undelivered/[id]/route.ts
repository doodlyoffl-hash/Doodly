/* POST /api/admin/subscriptions/undelivered/[id] — apply a remedy to a subscription with
   undelivered paid days: { action: "rollforward" | "credit" | "dismiss" }.
   Admin + Super-Admin only. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireSubsAdmin, actorId, actorRole } from "@/lib/subscriptions/guard";
import { audit } from "@/lib/auth/audit";
import { rollForwardUndelivered, creditUndelivered } from "@/lib/subscriptions/undelivered";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["rollforward", "credit", "dismiss"]) });

export const POST = route("admin.subscriptions.undelivered.apply", async (req: NextRequest, { params }: { params: { id: string } }) => {
  requireSubsAdmin(req);
  const { action } = await parseBody(req, schema);
  const actor = { actorId: actorId(req), actorRole: actorRole(req) };

  if (action === "rollforward") return ok({ result: await rollForwardUndelivered(params.id, actor) });
  if (action === "credit") return ok({ result: await creditUndelivered(params.id, actor) });

  // dismiss — admin reviewed and takes no automated action; hide until a newer lapse appears.
  await db.subscriptionEvent.create({ data: { subscriptionId: params.id, type: "UNDELIVERED_DISMISSED", summary: "Undelivered days reviewed — no action (dismissed)", byId: actor.actorId ?? null, byRole: actor.actorRole } }).catch(() => {});
  await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "subscription.undelivered.dismiss", target: params.id.slice(-6).toUpperCase() }).catch(() => {});
  return ok({ result: { dismissed: true } });
});
