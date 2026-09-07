/* /api/private/milk-business/warehouse/sales — walk-in warehouse sales.
   GET  ?from=&to=&customerId=&status=   → list
   POST { action: "create", litres, pricePerLitrePaise?, customerId?, ... }
        { action: "void", id, reason }   → gated on the `adjust` special
   Gated server-side on the milkBusiness RBAC module. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listWarehouseSales, createWarehouseSale, voidWarehouseSale, collectWarehousePayment, warehouseOutstanding } from "@/lib/milk-business/warehouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("view") === "outstanding") return NextResponse.json({ ok: true, outstanding: await warehouseOutstanding() }, { headers: { "Cache-Control": "no-store" } });
    const sales = await listWarehouseSales({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, customerId: sp.get("customerId") ?? undefined, status: sp.get("status") ?? undefined });
    return NextResponse.json({ ok: true, sales }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("mb.warehouse.sales.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load sales." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "create");
  // Voiding a sale is a financial reversal → require the `adjust` special (full access).
  const g = requireMilkBusiness(req, action === "void" ? "adjust" : "create");
  if (!g.ok) return g.res;
  const actor = { userId: g.userId, role: g.role };
  try {
    if (action === "create") return NextResponse.json({ ok: true, ...(await createWarehouseSale(body as never, actor)) });
    if (action === "void") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, ...(await voidWarehouseSale(String(body.id), body.reason as string, actor)) }); }
    if (action === "collectPayment") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, ...(await collectWarehousePayment(String(body.id), Math.round(Number(body.amountPaise) || 0), body.method as string, body.reference as string, actor)) }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
