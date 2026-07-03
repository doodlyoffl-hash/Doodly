/* GET /api/admin/payments/reports — analytics + CSV rows (payments:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { paymentReports } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.payments.reports", async (req: NextRequest) => {
  requirePermission(req, "payments", "view");
  const p = new URL(req.url).searchParams;
  return ok(await paymentReports({ dateFrom: p.get("from") || undefined, dateTo: p.get("to") || undefined }));
});
