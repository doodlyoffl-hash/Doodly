/* GET /api/admin/loyalty/members — programme KPIs + tier-tagged member list
   for the admin Loyalty module (loyalty:view). Search via ?q=. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { listMembers, loyaltyReports } from "@/lib/loyalty/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.loyalty.members", async (req: NextRequest) => {
  requirePermission(req, "loyalty", "view");
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const [reports, members] = await Promise.all([loyaltyReports(), listMembers({ q, limit: 300 })]);
  return ok({ reports, members });
});
