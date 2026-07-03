/* GET /api/admin/customers/reports — customer analytics + CSV rows (customers:view).
   Optional ?from= & ?to= (ISO) windows by registration date. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { customerReports } from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.customers.reports", async (req: NextRequest) => {
  requirePermission(req, "customers", "view");
  const p = new URL(req.url).searchParams;
  return ok(await customerReports({ dateFrom: p.get("from") || undefined, dateTo: p.get("to") || undefined }));
});
