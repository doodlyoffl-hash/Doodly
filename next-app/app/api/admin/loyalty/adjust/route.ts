/* POST /api/admin/loyalty/adjust — manual points adjustment (+ grant / - deduct)
   for a customer (loyalty:edit). Audited. Positive grants a new lot; negative
   deducts from the available balance (oldest-first). Used for goodwill and to
   restore incorrectly-expired points. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { adminAdjust } from "@/lib/loyalty/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string().min(1),
  points: z.number().int().refine((n) => n !== 0, "Points must be non-zero"),
  reason: z.string().min(1).max(200),
});

export const POST = route("admin.loyalty.adjust", async (req: NextRequest) => {
  const role = requirePermission(req, "loyalty", "edit");
  const { userId, points, reason } = await parseBody(req, schema);
  const res = await adminAdjust({ userId, points, reason, createdById: readUserId(req) ?? undefined });
  const okRes = ("awarded" in res && res.awarded) || ("ok" in res && res.ok);
  if (!okRes) throw Errors.badRequest("reason" in res && res.reason === "insufficient" ? "Customer doesn't have enough points to deduct." : "Adjustment failed.");
  await audit({ actorRole: role, action: "loyalty.adjust", target: `${userId} ${points > 0 ? "+" : ""}${points} (${reason})`, ctx: reqContext(req) });
  return ok(res);
});
