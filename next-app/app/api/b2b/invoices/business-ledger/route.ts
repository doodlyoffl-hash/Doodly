/* GET /api/b2b/invoices/business-ledger?businessId=&asOf= — Admin / Super-Admin only.
   One business's chronological invoice + payment ledger with a running balance (Step 8). */
import { NextRequest, NextResponse } from "next/server";
import { businessLedger } from "@/lib/b2b/outstanding";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const businessId = sp.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  try {
    return NextResponse.json(await businessLedger(businessId, { asOf: sp.get("asOf") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoices.businessLedger", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load the business ledger." }, { status: 500 });
  }
}
