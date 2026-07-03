/* /api/admin/payments/gateways — gateway configuration + readiness.
   GET   — list gateways + which env credentials are present (payments:view).
   PATCH — toggle/configure a gateway (payments:edit; mode/keys = Super-Admin via matrix). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/payments/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listGateways, setGateway } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.payments.gateways", async (req: NextRequest) => {
  requirePermission(req, "payments", "view");
  return ok({ gateways: await listGateways() });
});

const schema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  mode: z.enum(["TEST", "LIVE"]).optional(),
  keyId: z.string().max(80).optional(),
  webhookConfigured: z.boolean().optional(),
});

export const PATCH = route("admin.payments.gateways.set", async (req: NextRequest) => {
  const role = requirePermission(req, "payments", "edit");
  const body = await parseBody(req, schema);
  const { name, ...data } = body;
  const g = await setGateway(name, data, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "payment.gateway.set", target: name, ctx: reqContext(req) });
  return ok({ gateway: { id: g.id, name: g.name, enabled: g.enabled, mode: g.mode } });
});
