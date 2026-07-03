/* /api/admin/quality/rules — configurable quality-acceptance thresholds.
   GET   — read (quality:view)
   PATCH — update (quality:edit), audited prev→new. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getQualityConfig, updateQualityConfig } from "@/lib/quality/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.quality.rules.get", async (req: NextRequest) => {
  requirePermission(req, "quality", "view");
  return ok(await getQualityConfig());
});

const schema = z.object({
  minFatPct: z.number().min(0).max(20).optional(),
  minSnfPct: z.number().min(0).max(20).optional(),
  tempMinC: z.number().min(-5).max(30).optional(),
  tempMaxC: z.number().min(-5).max(40).optional(),
  densityMin: z.number().min(0).max(50).optional(),
  densityMax: z.number().min(0).max(50).optional(),
});

export const PATCH = route("admin.quality.rules.update", async (req: NextRequest) => {
  const role = requirePermission(req, "quality", "edit");
  const body = await parseBody(req, schema);
  const { config, changes } = await updateQualityConfig(body, { actorRole: role });
  await audit({ actorRole: role, action: "quality.rules.update", target: changes.map((c) => c.field).join(",") || "none", ctx: reqContext(req) });
  return ok({ config, changes });
});
