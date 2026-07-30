/* GET/PATCH /api/admin/bottles/deposit-config — Super-Admin bottle-deposit & refund
   policy (deposit per bottle, require-verification, auto-refund, partial-refund).
   RBAC settings:edit (super-admin surface). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { getBottleDepositConfig, patchBottleDepositConfig } from "@/lib/bottles/deposit-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  enabled: z.boolean().optional(),
  requireVerification: z.boolean().optional(),
  autoRefundOnCollection: z.boolean().optional(),
  partialRefundAllowed: z.boolean().optional(),
  depositPerBottlePaise: z.number().int().min(0).max(100000).nullable().optional(),
});

export const GET = route("admin.bottles.depositConfig.get", async (req: NextRequest) => {
  requirePermission(req, "settings", "view");
  return ok(await getBottleDepositConfig());
});

export const PATCH = route("admin.bottles.depositConfig.patch", async (req: NextRequest) => {
  requirePermission(req, "settings", "edit");
  const body = await parseBody(req, Body);
  const next = await patchBottleDepositConfig(body, readUserId(req));
  await audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "bottle.depositConfig.update", target: JSON.stringify(next), ctx: reqContext(req) }).catch(() => {});
  return ok(next);
});
