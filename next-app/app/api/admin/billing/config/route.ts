/* /api/admin/billing/config — GST + auto-pay retry policy + invoice/company settings.
   GET   — readable by Admin + Super-Admin (canEdit flag = Super-Admin).
   PATCH — Super-Admin only. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireBillingAdmin, requireBillingSuperAdmin, isSuperAdmin, actorId } from "@/lib/billing/guard";
import { reqIp } from "@/lib/billing/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getBillingConfig, setBillingConfig } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.billing.config.get", async (req: NextRequest) => {
  const role = requireBillingAdmin(req);
  return ok(await getBillingConfig(isSuperAdmin(role)));
});

const patchSchema = z.object({
  gstBps: z.number().int().min(0).max(5000).optional(),
  autopayRetryLimit: z.number().int().min(1).max(10).optional(),
  autopayRetryIntervalHours: z.number().int().min(1).max(168).optional(),
  invoicePrefix: z.string().min(2).max(40).optional(),
  companyName: z.string().min(1).max(80).optional(),
  gstin: z.string().max(20).nullable().optional(),
});

export const PATCH = route("admin.billing.config.set", async (req: NextRequest) => {
  const role = requireBillingSuperAdmin(req);
  const body = await parseBody(req, patchSchema);
  const cfg = await setBillingConfig(body, { actorId: actorId(req), actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "billing.config.update", target: "default", ctx: reqContext(req) });
  return ok(cfg);
});
