/* /api/b2b/invoices/outstanding — Admin / Super-Admin only. THE outstanding ledger.
   GET ?asOf=&from=&to=&basis=&businessId=&q=&status=&amountFrom/To=&outFrom/To=&gstOnly=&summary=1&all=1
   ?view=payments  → payment history   ·   ?view=collection → collection report (grouped by business) */
import { NextRequest, NextResponse } from "next/server";
import { computeLedger, outstandingSummary, paymentHistory, collectionReport, parseOutstandingFilters } from "@/lib/b2b/outstanding";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const f = parseOutstandingFilters(sp);
    const view = sp.get("view");
    if (view === "payments") return NextResponse.json({ payments: await paymentHistory(f) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "collection") return NextResponse.json(await collectionReport(f), { headers: { "Cache-Control": "no-store" } });
    const [ledger, summary] = await Promise.all([
      computeLedger(f),
      sp.get("summary") === "1" ? outstandingSummary(f) : Promise.resolve(null),
    ]);
    return NextResponse.json({ rows: ledger.rows, asOf: ledger.asOf.toISOString(), summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoices.outstanding", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load the outstanding ledger." }, { status: 500 });
  }
}
