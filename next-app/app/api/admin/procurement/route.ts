/* /api/admin/procurement — daily milk-collection batches.
   GET  — enriched list (procurement:view), search/farmer/quality/payment/center/route/date filters.
   POST — record a collection (procurement:create): pricing = farmer rate × litres,
          auto-generates a batch number, and accepted collections increment raw-milk inventory. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { listProcurement, createProcurement } from "@/lib/procurement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.procurement.list", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const sp = req.nextUrl.searchParams;
  const res = await listProcurement({
    search: sp.get("search") ?? undefined, farmerId: sp.get("farmerId") ?? undefined, quality: sp.get("quality") ?? undefined,
    payment: sp.get("payment") ?? undefined, center: sp.get("center") ?? undefined, route: sp.get("route") ?? undefined,
    from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined,
  });
  return ok({ procurements: res.items, stats: res.stats });
});

const createSchema = z.object({
  farmerId: z.string().min(1),
  collectedAt: z.string().datetime().optional(),
  litres: z.number().positive(),
  fatPct: z.number().min(0).max(100),
  snfPct: z.number().min(0).max(100),
  lactometer: z.number().optional(),
  temperatureC: z.number().optional(),
  batchNo: z.string().trim().min(2).max(40).optional(),
  accepted: z.boolean().optional(),
});

export const POST = route("admin.procurement.create", async (req: NextRequest) => {
  const role = requirePermission(req, "procurement", "create");
  const body = await parseBody(req, createSchema);
  const procurement = await createProcurement(body, { actorRole: role });
  await audit({ actorRole: role, action: "procurement.create", target: procurement.id, ctx: reqContext(req) });
  return ok({ procurement }, { status: 201 });
});
