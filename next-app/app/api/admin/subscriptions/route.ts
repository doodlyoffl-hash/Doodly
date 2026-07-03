/* /api/admin/subscriptions — admin Subscriptions list + create.
   GET  — filter / sort / paginate, with facets for the filter UI.
   POST — create a subscription on a customer's behalf.
   Admin + Super-Admin ONLY (requireSubsAdmin). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireSubsAdmin, actorId } from "@/lib/subscriptions/guard";
import { reqIp } from "@/lib/subscriptions/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listSubscriptions, createSubscription, type ListArgs } from "@/lib/subscriptions/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.subscriptions.list", async (req: NextRequest) => {
  requireSubsAdmin(req);
  const p = new URL(req.url).searchParams;
  const args: ListArgs = {
    status: p.get("status") || undefined,
    autopay: p.get("autopay") || undefined,
    planSlug: p.get("plan") || undefined,
    productId: p.get("product") || undefined,
    zoneId: p.get("zone") || undefined,
    dateFrom: p.get("from") || undefined,
    dateTo: p.get("to") || undefined,
    q: p.get("q") || undefined,
    sort: p.get("sort") || undefined,
    dir: (p.get("dir") as "asc" | "desc") || undefined,
    page: p.get("page") ? Number(p.get("page")) : undefined,
    pageSize: p.get("pageSize") ? Number(p.get("pageSize")) : undefined,
  };
  return ok(await listSubscriptions(args));
});

const createSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  addressId: z.string().min(1),
  items: z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(20) })).min(1),
  startDate: z.string().datetime().optional(),
  deliverySlot: z.string().min(1).optional(),
  autoRenew: z.boolean().optional(),
});

export const POST = route("admin.subscriptions.create", async (req: NextRequest) => {
  const role = requireSubsAdmin(req);
  const body = await parseBody(req, createSchema);
  const res = await createSubscription(body, { actorId: actorId(req), actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "subscription.create", target: res.id, ctx: reqContext(req) });
  return ok({ subscription: res }, { status: 201 });
});
