/* /api/admin/milk/config — the editable seasonal rates.
   GET   — current rates (procurement:view).
   PATCH — update (super_admin only; the rates govern every future tanker's cost). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { getMilkConfig, setMilkConfig } from "@/lib/milk/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.config.get", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  return ok({ config: await getMilkConfig() });
});

const patchSchema = z.object({
  conversionFactor: z.number().positive().optional(),
  milkRatePaise: z.number().int().min(0).optional(),
  fatRatePaise: z.number().int().min(0).optional(),
  transportPaise: z.number().int().min(0).optional(),
  currency: z.string().max(8).optional(),
  taxBps: z.number().int().min(0).max(10000).optional(),
  financialYear: z.string().max(16).optional().nullable(),
});

export const PATCH = route("admin.milk.config.update", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  if (readRole(req) !== "super_admin") throw Errors.forbidden("Only a Super Admin can change the milk cost settings.");
  const body = await parseBody(req, patchSchema);
  try {
    const config = await setMilkConfig(body, { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) });
    return ok({ config });
  } catch (e) {
    throw Errors.badRequest((e as Error)?.message || "Could not update the settings.");
  }
});
