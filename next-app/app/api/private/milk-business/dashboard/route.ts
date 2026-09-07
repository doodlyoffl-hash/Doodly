/* GET /api/private/milk-business/dashboard?date=&month=
   Private Milk-Business Control Centre. Gated server-side on the `milkBusiness`
   RBAC module (super_admin / accountant / operations) — this is the REAL boundary,
   since the static admin page is publicly fetchable. Read-only aggregation over
   the existing milk/B2B/expense engines. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { getControlCentre } from "@/lib/milk-business/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  try {
    const data = await getControlCentre(sp.get("date"), sp.get("month"));
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("private.milk-business.dashboard", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Could not load the control centre." }, { status: 500 });
  }
}
