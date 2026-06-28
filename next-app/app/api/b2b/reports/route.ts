/* /api/b2b/reports — Admin / Super-Admin only.
   GET ?from=&to=  — sales, top businesses/products, outstanding, status mix. */
import { NextRequest, NextResponse } from "next/server";
import { b2bReports } from "@/lib/b2b/service";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const report = await b2bReports({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.reports.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}
