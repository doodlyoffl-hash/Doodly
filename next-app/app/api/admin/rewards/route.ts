/* /api/admin/rewards — Reward Management (internal).
   GET  ?id=<id>            — full detail (joined subscription/winner/users + claim URL).
   GET  ?status=&source=&search=&take=&skip=  — filtered list + global status counts.
                              (rewards:view)
   POST { action, ... }      — issue | cancel | resend. (rewards:create / rewards:edit)
   All mutations audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { listRewards, getRewardDetail, adminIssueReward, cancelReward, resendRewardNotification } from "@/lib/rewards/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.rewards", async (req: NextRequest) => {
  requirePermission(req, "rewards", "view");
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) return ok(await getRewardDetail(id));
  return ok(await listRewards({
    status: sp.get("status"), source: sp.get("source"), search: sp.get("search"),
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
    skip: sp.get("skip") ? Number(sp.get("skip")) : undefined,
  }));
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("issue"),
    campaignName: z.string().trim().min(1).max(120),
    issuedToEmail: z.string().trim().max(160).optional().nullable(),
    variantMl: z.coerce.number().int().positive().max(100000).optional(),
    qty: z.coerce.number().int().positive().max(50).optional(),
    planSlug: z.string().trim().min(1).max(40).optional(),
    expiresInDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    notify: z.boolean().optional(),
  }),
  z.object({ action: z.literal("cancel"), id: z.string().min(1), reason: z.string().trim().max(300).optional().nullable() }),
  z.object({ action: z.literal("resend"), id: z.string().min(1) }),
]);

export const POST = route("admin.rewards.action", async (req: NextRequest) => {
  const body = await parseBody(req, schema);
  const role = requirePermission(req, "rewards", body.action === "issue" ? "create" : "edit");
  const actor = { userId: readUserId(req), role };
  const ctx = reqContext(req);

  if (body.action === "issue") {
    return ok(await adminIssueReward({
      campaignName: body.campaignName, issuedToEmail: body.issuedToEmail ?? null,
      variantMl: body.variantMl, qty: body.qty, planSlug: body.planSlug,
      expiresInDays: body.expiresInDays ?? null, notes: body.notes ?? null, notify: body.notify ?? false,
      actor, ctx,
    }));
  }
  if (body.action === "cancel") return ok(await cancelReward(body.id, actor, ctx, body.reason ?? null));
  return ok(await resendRewardNotification(body.id, actor, ctx));
});
