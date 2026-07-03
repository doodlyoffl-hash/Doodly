/* /api/admin/billing — Subscription Billing list + create. Admin + Super-Admin ONLY. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireBillingAdmin, actorId } from "@/lib/billing/guard";
import { reqIp } from "@/lib/billing/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listBillings, createBilling, type ListArgs } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.billing.list", async (req: NextRequest) => {
  requireBillingAdmin(req);
  const p = new URL(req.url).searchParams;
  const args: ListArgs = {
    paymentStatus: p.get("paymentStatus") || undefined,
    billingStatus: p.get("billingStatus") || undefined,
    autopay: p.get("autopay") || undefined,
    planSlug: p.get("plan") || undefined,
    productId: p.get("product") || undefined,
    dateFrom: p.get("from") || undefined,
    dateTo: p.get("to") || undefined,
    q: p.get("q") || undefined,
    sort: p.get("sort") || undefined,
    page: p.get("page") ? Number(p.get("page")) : undefined,
    pageSize: p.get("pageSize") ? Number(p.get("pageSize")) : undefined,
  };
  return ok(await listBillings(args));
});

const createSchema = z.object({
  subscriptionId: z.string().min(1),
  walletApplyPaise: z.number().int().min(0).max(100_000_00).optional(),
  gstBps: z.number().int().min(0).max(5000).optional(),
  autoCollect: z.boolean().optional(),
});

export const POST = route("admin.billing.create", async (req: NextRequest) => {
  const role = requireBillingAdmin(req);
  const body = await parseBody(req, createSchema);
  const res = await createBilling(body, { actorId: actorId(req), actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "billing.create", target: res.id, ctx: reqContext(req) });
  return ok({ billing: res }, { status: 201 });
});
