/* /api/b2b/orders — Admin / Super-Admin only.
   GET  ?status=&businessId=&q=&from=&to=   — list B2B orders
   POST { ...order }                        — create order (auto B2B-ORD number) */
import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders } from "@/lib/b2b/service";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import type { B2BOrderStatus } from "@/lib/b2b/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const result = await listOrders({
      status: (sp.get("status") as B2BOrderStatus) ?? undefined,
      businessId: sp.get("businessId") ?? undefined,
      q: sp.get("q") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      paymentStatus: (sp.get("paymentStatus") as "PENDING" | "PARTIAL" | "PAID" | "CREDIT") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.orders.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const order = await createOrder(json, { actorId: actorId(req), actorRole: role });
    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create order" }, { status: 409 });
  }
}
