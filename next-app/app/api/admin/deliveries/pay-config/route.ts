/* /api/admin/deliveries/pay-config
   GET   — the driver-pay ESTIMATE rate policy (deliverySettings:view).
   PATCH — update the tunable rates (deliverySettings:edit) — Operations/Admin only,
           never a delivery executive. The estimate moves no money; this only tunes
           how the GPS-distance pay estimate is computed. Every change is audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { getDriverPayConfig, patchDriverPayConfig } from "@/lib/delivery/pay-config";
import { payRateBasis } from "@/lib/delivery/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.payConfig.get", async (req: NextRequest) => {
  requirePermission(req, "deliverySettings", "view");
  const config = await getDriverPayConfig();
  return ok({ config, basis: payRateBasis(config) });
});

const Body = z.object({
  enabled: z.boolean().optional(),
  perKmRate: z.number().min(0).max(1000).optional(),
  fuelPerKm: z.number().min(0).max(1000).optional(),
  perDeliveryRate: z.number().min(0).max(10000).optional(),
  baseShiftPay: z.number().min(0).max(100000).optional(),
  minShiftPay: z.number().min(0).max(100000).optional(),
});

export const PATCH = route("admin.deliveries.payConfig.set", async (req: NextRequest) => {
  requirePermission(req, "deliverySettings", "edit");
  const patch = await parseBody(req, Body);
  const config = await patchDriverPayConfig(patch, readUserId(req));
  try { const { audit } = await import("@/lib/auth/audit"); await audit({ userId: readUserId(req), actorRole: readRole(req), action: "deliveries.payConfig.updated", target: payRateBasis(config), ctx: reqContext(req) }); } catch { /* non-blocking */ }
  return ok({ config, basis: payRateBasis(config) });
});
