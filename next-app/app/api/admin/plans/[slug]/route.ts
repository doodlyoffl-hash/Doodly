/* /api/admin/plans/[slug] — edit a subscription plan (products:edit).
   PATCH — persist plan discount / days / name / badge / auto-renew / active to
   the DB by stable slug ("single","p7","p30","p90"). This is what the product
   editor's Subscriptions tab writes to, so plan-discount edits survive
   deploys, restarts and device changes (they used to be localStorage-only). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { slug: string } };

const patchSchema = z.object({
  discountBps: z.number().int().min(0).max(10000).optional(),
  days: z.number().int().min(1).max(3650).optional(),
  name: z.string().min(1).max(80).optional(),
  badge: z.string().max(40).nullable().optional(),
  autoRenew: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const PATCH = route("admin.plans.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "products", "edit");
  const body = await parseBody(req, patchSchema);
  const existing = await db.plan.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!existing) throw Errors.notFound("Plan not found.");
  const data: Record<string, unknown> = {};
  for (const k of ["discountBps", "days", "name", "badge", "autoRenew", "active"] as const) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (!Object.keys(data).length) throw Errors.badRequest("No plan fields to update.");
  await db.plan.update({ where: { slug: params.slug }, data });
  await audit({ actorRole: role, action: "plan.update", target: params.slug, ctx: reqContext(req) });
  return ok({ slug: params.slug, changed: Object.keys(data) });
});
