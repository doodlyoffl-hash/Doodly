/* /api/admin/settings — platform settings (the Cashback & Rewards config).
   GET   — read (settings:view). Includes `canEdit` so the UI can lock the form.
   PATCH — update (settings:edit — only Super Admin holds this). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { can } from "@/lib/rbac";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIG_ID = "default";

async function getConfig() {
  return db.cashbackConfig.upsert({ where: { id: CONFIG_ID }, update: {}, create: { id: CONFIG_ID } });
}

export const GET = route("admin.settings.get", async (req: NextRequest) => {
  const role = requirePermission(req, "settings", "view");
  const config = await getConfig();
  return ok({ config, canEdit: can(role, "settings", "edit") });
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  amountPaise: z.number().int().nonnegative().optional(),
  eligiblePlanSlugs: z.array(z.string().trim().min(1)).optional(),
  expiryDays: z.number().int().positive().nullable().optional(),
});

export const PATCH = route("admin.settings.update", async (req: NextRequest) => {
  const role = requirePermission(req, "settings", "edit"); // Super Admin only
  const body = await parseBody(req, patchSchema);
  await getConfig(); // ensure the row exists
  const config = await db.cashbackConfig.update({ where: { id: CONFIG_ID }, data: body });
  await audit({ actorRole: role, action: "settings.update", target: CONFIG_ID, ctx: reqContext(req) });
  return ok({ config, canEdit: true });
});
