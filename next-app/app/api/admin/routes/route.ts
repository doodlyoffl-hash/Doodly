/* /api/admin/routes — delivery routes.
   GET  — enriched list + dashboard stats (routes:view), search/status/zone/driver.
   POST — create a route (routes:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { listRoutes, createRoute } from "@/lib/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.routes.list", async (req: NextRequest) => {
  requirePermission(req, "routes", "view");
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? undefined;
  const res = await listRoutes({ search: sp.get("search") ?? undefined, status: sp.get("status") ?? undefined, zoneId: sp.get("zoneId") ?? undefined, driverId: sp.get("driverId") ?? undefined, date });
  return ok({ routes: res.items, stats: res.stats, date: date ?? null });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z.string().trim().max(30).nullable().optional(),
  date: z.string().datetime().optional(),
  driverId: z.string().min(1).nullable().optional(),
  zoneId: z.string().min(1).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const POST = route("admin.routes.create", async (req: NextRequest) => {
  const role = requirePermission(req, "routes", "create");
  const body = await parseBody(req, createSchema);
  const r = await createRoute(body, { actorRole: role });
  await audit({ actorRole: role, action: "route.create", target: r.id, ctx: reqContext(req) });
  return ok({ route: r }, { status: 201 });
});
