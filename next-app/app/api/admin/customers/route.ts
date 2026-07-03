/* /api/admin/customers — customer directory list + create.
   GET  — filter / sort / paginate (customers:view, so support can read).
   POST — create a customer (customers:create → Admin + Super-Admin). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/customers/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listCustomers, createCustomer, type ListArgs } from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.customers.list", async (req: NextRequest) => {
  requirePermission(req, "customers", "view");
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  const args: ListArgs = {
    status: p.get("status") || undefined,
    type: p.get("type") || undefined,
    planSlug: p.get("plan") || undefined,
    zoneId: p.get("zone") || undefined,
    pincode: p.get("pincode") || undefined,
    walletMin: num("walletMin"),
    walletMax: num("walletMax"),
    regFrom: p.get("regFrom") || undefined,
    regTo: p.get("regTo") || undefined,
    orderFrom: p.get("orderFrom") || undefined,
    orderTo: p.get("orderTo") || undefined,
    q: p.get("q") || undefined,
    sort: p.get("sort") || undefined,
    dir: (p.get("dir") as "asc" | "desc") || undefined,
    page: num("page"),
    pageSize: num("pageSize"),
  };
  return ok(await listCustomers(args));
});

const createSchema = z.object({
  name: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(20).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
});

export const POST = route("admin.customers.create", async (req: NextRequest) => {
  const role = requirePermission(req, "customers", "create");
  const body = await parseBody(req, createSchema);
  const res = await createCustomer(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "customer.create", target: res.id, ctx: reqContext(req) });
  return ok({ customer: res }, { status: 201 });
});
