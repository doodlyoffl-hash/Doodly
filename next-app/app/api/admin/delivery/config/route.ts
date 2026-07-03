/* /api/admin/delivery/config — global Delivery Settings (single row).
   GET   — read config (deliverySettings:view)
   PATCH — update config (deliverySettings:edit), audited prev→new. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getDeliveryConfig, updateDeliveryConfig } from "@/lib/delivery/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.delivery.config.get", async (req: NextRequest) => {
  requirePermission(req, "deliverySettings", "view");
  return ok(await getDeliveryConfig());
});

const schema = z.object({
  cutoffHour: z.number().int().min(0).max(23).optional(),
  cutoffMinute: z.number().int().min(0).max(59).optional(),
  slotStart: z.string().max(40).optional(),
  slotEnd: z.string().max(40).optional(),
  availableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  weekendDelivery: z.boolean().optional(),
  minAdvanceDays: z.number().int().min(1).max(60).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  holidays: z.array(z.string().max(20)).max(200).optional(),
  blackoutDates: z.array(z.string().max(20)).max(200).optional(),
  deliveryChargePaise: z.number().int().min(0).max(10_000_000).optional(),
  freeAbovePaise: z.number().int().min(0).max(1_000_000_000).optional(),
  autoAssign: z.boolean().optional(),
  maxPerExecutive: z.number().int().min(1).max(1000).optional(),
  maxBottleCapacity: z.number().int().min(1).max(10000).optional(),
  slaPromiseTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  slaGraceMin: z.number().int().min(0).max(720).optional(),
});

export const PATCH = route("admin.delivery.config.update", async (req: NextRequest) => {
  const role = requirePermission(req, "deliverySettings", "edit");
  const body = await parseBody(req, schema);
  const { config, changes } = await updateDeliveryConfig(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.config.update", target: changes.map((c) => c.field).join(",") || "none", ctx: reqContext(req) });
  return ok({ config, changes });
});
