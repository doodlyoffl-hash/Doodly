/* GET /api/b2b/pricing/reports — Admin / Super-Admin only.
   Pricing coverage, average discount, by-business and by-product breakdowns. */
import { NextRequest, NextResponse } from "next/server";
import { pricingReports } from "@/lib/b2b/pricing";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await pricingReports(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.pricing.reports", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}
