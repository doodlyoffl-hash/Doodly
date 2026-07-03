/* GET /api/admin/quality/stats — Quality dashboard KPIs from live QualityTest +
   Procurement. RBAC: quality:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { qualityStats } from "@/lib/quality/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.quality.stats", async (req: NextRequest) => {
  requirePermission(req, "quality", "view");
  return ok(await qualityStats());
});
