/* /api/b2b/pricing/retail — B2B product RETAIL (base) prices, DB-backed.
   GET  → current retail price per product (rupees), Admin / Super-Admin.
   PUT  { retail: { slug: rupees } } → save overrides, Super-Admin only.

   Retail lives in AppSetting ("b2b.retail") so every device/staff member
   sees the same prices — replacing the old per-browser localStorage values.
   The API speaks RUPEES (what the admin UI uses); storage is paise. */
import { NextRequest, NextResponse } from "next/server";
import { getRetailPrices, setRetailPrices } from "@/lib/b2b/pricing";
import { B2B_PRODUCTS } from "@/lib/b2b/catalog";
import { actorRole, actorId, canUseB2B, isSuperAdmin } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape the paise map into a UI-friendly list with names, in rupees. */
async function payload() {
  const paise = await getRetailPrices();
  return {
    products: B2B_PRODUCTS.map((p) => ({
      slug: p.slug,
      name: p.name,
      primaryUnit: p.primaryUnit,
      retail: Math.round((paise[p.slug] ?? p.defaultPricePaise)) / 100,   // rupees
    })),
  };
}

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await payload(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.retail.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load retail prices." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const role = actorRole(req);
  // Changing retail is a pricing-config action — Super-Admin only, like the
  // other B2B pricing configuration (see lib/b2b/guard.ts).
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Only a Super Admin can change retail prices." }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const retail = (json as { retail?: Record<string, unknown> })?.retail;
  if (!retail || typeof retail !== "object") return NextResponse.json({ error: "Provide a retail price map." }, { status: 422 });

  // rupees → paise, ignore anything non-numeric or non-positive
  const overridesPaise: Record<string, number> = {};
  for (const [slug, v] of Object.entries(retail)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) overridesPaise[slug] = Math.round(n * 100);
  }

  try {
    await setRetailPrices(overridesPaise, { actorId: actorId(req), actorRole: role });
    return NextResponse.json(await payload());
  } catch (e) {
    console.error("b2b.retail.put", (e as Error)?.message);
    return NextResponse.json({ error: "Could not save retail prices." }, { status: 500 });
  }
}
