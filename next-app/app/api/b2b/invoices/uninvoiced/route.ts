/* GET /api/b2b/invoices/uninvoiced — Admin / Super-Admin only.
   B2B orders that don't yet have an invoice (for the Create-invoice picker). */
import { NextRequest, NextResponse } from "next/server";
import { uninvoicedOrders } from "@/lib/b2b/invoices";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ orders: await uninvoicedOrders() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoices.uninvoiced", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
}
