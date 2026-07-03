/* GET /api/b2b/invoices/reports?from=&to= — Admin / Super-Admin only.
   Invoice/revenue/GST/outstanding/overdue totals + by-business breakdown. */
import { NextRequest, NextResponse } from "next/server";
import { invoiceReports } from "@/lib/b2b/invoices";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json(await invoiceReports({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoices.reports", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}
