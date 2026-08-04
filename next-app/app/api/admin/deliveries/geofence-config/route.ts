/* /api/admin/deliveries/geofence-config
   GET   — the automatic "Reached Customer" geofence policy (deliverySettings:view).
   PATCH — tune radius / min-accuracy / dwell / verified-pin / enable
           (deliverySettings:edit) — Operations/Admin only, never a delivery executive.
           No code change is needed to adjust the arrival rules. Every change is audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { getGeofenceConfig, patchGeofenceConfig } from "@/lib/delivery/geofence-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.geofenceConfig.get", async (req: NextRequest) => {
  requirePermission(req, "deliverySettings", "view");
  return ok({ config: await getGeofenceConfig() });
});

const Body = z.object({
  enabled: z.boolean().optional(),
  radiusM: z.number().min(10).max(2000).optional(),
  minAccuracyM: z.number().min(10).max(1000).optional(),
  minStaySeconds: z.number().min(0).max(600).optional(),
  requireVerifiedPin: z.boolean().optional(),
});

export const PATCH = route("admin.deliveries.geofenceConfig.set", async (req: NextRequest) => {
  requirePermission(req, "deliverySettings", "edit");
  const patch = await parseBody(req, Body);
  const config = await patchGeofenceConfig(patch, readUserId(req));
  try {
    const { audit } = await import("@/lib/auth/audit");
    await audit({ userId: readUserId(req), actorRole: readRole(req), action: "deliveries.geofenceConfig.updated", target: `radius ${config.radiusM}m · dwell ${config.minStaySeconds}s · acc ≤${config.minAccuracyM}m · verifiedPin ${config.requireVerifiedPin ? "req" : "off"} · ${config.enabled ? "ON" : "OFF"}`, ctx: reqContext(req) });
  } catch { /* non-blocking */ }
  return ok({ config });
});
