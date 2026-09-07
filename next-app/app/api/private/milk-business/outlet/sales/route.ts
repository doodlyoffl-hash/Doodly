/* /api/private/milk-business/outlet/sales — retail-outlet sales.
   GET  ?from=&to=&outletId=&status=
   POST { action: "create", outletId, litres, ... } | { action: "void", id, reason }
   Void is gated on the `adjust` special. milkBusiness RBAC (server boundary). */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listOutletSales, createOutletSale, voidOutletSale, collectOutletPayment, outletOutstanding } from "@/lib/milk-business/outlet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("view") === "outstanding") return NextResponse.json({ ok: true, outstanding: await outletOutstanding() }, { headers: { "Cache-Control": "no-store" } });
    const sales = await listOutletSales({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, outletId: sp.get("outletId") ?? undefined, status: sp.get("status") ?? undefined });
    return NextResponse.json({ ok: true, sales }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("mb.outlet.sales.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load sales." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "create");
  const g = requireMilkBusiness(req, action === "void" ? "adjust" : "create");
  if (!g.ok) return g.res;
  const actor = { userId: g.userId, role: g.role };
  try {
    if (action === "create") return NextResponse.json({ ok: true, ...(await createOutletSale(body as never, actor)) });
    if (action === "void") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, ...(await voidOutletSale(String(body.id), body.reason as string, actor)) }); }
    if (action === "collectPayment") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, ...(await collectOutletPayment(String(body.id), Math.round(Number(body.amountPaise) || 0), body.method as string, body.reference as string, actor)) }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
