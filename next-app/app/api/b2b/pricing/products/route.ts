/* GET /api/b2b/pricing/products — Admin / Super-Admin only.
   Product lookup for the pricing form (slug, name, units, base price). */
import { NextRequest, NextResponse } from "next/server";
import { productLookup } from "@/lib/b2b/pricing";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ products: productLookup() }, { headers: { "Cache-Control": "no-store" } });
}
