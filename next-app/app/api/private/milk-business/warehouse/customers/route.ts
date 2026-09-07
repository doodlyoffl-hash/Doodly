/* /api/private/milk-business/warehouse/customers — walk-in customers + their pricing.
   GET  ?q=&includeInactive=1        → list
        ?pricingFor=<id>             → that customer's effective-dated price history
   POST { action: create|update|setPrice, ... }
   Gated server-side on the milkBusiness RBAC module (the real boundary). */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listWarehouseCustomers, createWarehouseCustomer, updateWarehouseCustomer, getCustomerPricing, setCustomerPrice } from "@/lib/milk-business/warehouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  try {
    const pricingFor = sp.get("pricingFor");
    if (pricingFor) return NextResponse.json({ ok: true, pricing: await getCustomerPricing(pricingFor) }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, customers: await listWarehouseCustomers({ q: sp.get("q") ?? undefined, includeInactive: sp.get("includeInactive") === "1" }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("mb.warehouse.customers.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load customers." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = requireMilkBusiness(req, "create");
  if (!g.ok) return g.res;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const actor = { userId: g.userId, role: g.role };
  try {
    if (action === "create") return NextResponse.json({ ok: true, customer: await createWarehouseCustomer(body as never, actor) });
    if (action === "update") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, customer: await updateWarehouseCustomer(String(body.id), body as never, actor) }); }
    if (action === "setPrice") { if (!body.customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 }); return NextResponse.json({ ok: true, pricing: await setCustomerPrice(String(body.customerId), Math.round(Number(body.pricePaise) || 0), (body.effectiveFrom as string) || undefined, actor) }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
