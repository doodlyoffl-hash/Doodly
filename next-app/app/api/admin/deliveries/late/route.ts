/* GET /api/admin/deliveries/late — Late Delivery Monitoring: SLA-based late
   detection over live Delivery records + dashboard stats + per-executive
   performance. Search / filter. RBAC: deliveries:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { lateOverview } from "@/lib/delivery/late";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.late", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const sp = req.nextUrl.searchParams;
  return ok(await lateOverview({
    search: sp.get("search") ?? undefined,
    exec: sp.get("exec") ?? undefined,
    status: sp.get("status") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  }));
});
