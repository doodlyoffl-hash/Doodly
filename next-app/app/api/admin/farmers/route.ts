/* /api/admin/farmers — milk suppliers.
   GET  — enriched list + dashboard stats (farmers:view), search/status/route/district/payment/quality.
   POST — register a farmer (farmers:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { listFarmers, createFarmer } from "@/lib/farmers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.farmers.list", async (req: NextRequest) => {
  requirePermission(req, "farmers", "view");
  const sp = req.nextUrl.searchParams;
  const res = await listFarmers({
    search: sp.get("search") ?? undefined, status: sp.get("status") ?? undefined, route: sp.get("route") ?? undefined,
    district: sp.get("district") ?? undefined, payment: sp.get("payment") ?? undefined, quality: sp.get("quality") ?? undefined,
  });
  return ok({ farmers: res.items, stats: res.stats });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  owner: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone"),
  altPhone: z.string().trim().max(20).nullable().optional(),
  village: z.string().trim().min(2).max(60),
  mandal: z.string().trim().max(60).nullable().optional(),
  district: z.string().trim().max(60).nullable().optional(),
  state: z.string().trim().max(60).nullable().optional(),
  pincode: z.string().trim().max(10).nullable().optional(),
  route: z.string().trim().max(60).nullable().optional(),
  center: z.string().trim().max(60).nullable().optional(),
  ratePerLitre: z.number().int().nonnegative(),
  notes: z.string().max(500).nullable().optional(),
});

export const POST = route("admin.farmers.create", async (req: NextRequest) => {
  const role = requirePermission(req, "farmers", "create");
  const body = await parseBody(req, createSchema);
  const farmer = await createFarmer(body, { actorRole: role });
  await audit({ actorRole: role, action: "farmer.create", target: farmer.id, ctx: reqContext(req) });
  return ok({ farmer }, { status: 201 });
});
