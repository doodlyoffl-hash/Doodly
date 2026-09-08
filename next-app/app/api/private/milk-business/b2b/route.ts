/* /api/private/milk-business/b2b — B2B order booking for the private module.
   Wraps the EXISTING B2B engine (lib/b2b/service createOrder / lookupBusinesses /
   registerBusiness / updateOrderStatus) — no duplicate logic — but gated on the
   milkBusiness RBAC module so accountant/operations can book without the full
   public B2B admin. Server prices each line (resolveUnitPricePaise); delivering
   an order recognises revenue + draws FIFO COGS via the existing pipeline. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { db } from "@/lib/db";
import { lookupBusinesses, registerBusiness, createOrder, updateOrderStatus } from "@/lib/b2b/service";
import { BUSINESS_TYPES, PAYMENT_TERMS } from "@/lib/b2b/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "businesses";
  try {
    if (view === "meta") return NextResponse.json({ ok: true, businessTypes: BUSINESS_TYPES, paymentTerms: PAYMENT_TERMS }, { headers: { "Cache-Control": "no-store" } });
    if (view === "businesses") return NextResponse.json({ ok: true, businesses: await lookupBusinesses(sp.get("q") ?? undefined, { limit: 500 }) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "orders") {
      const rows = await db.businessOrder.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, code: true, status: true, deliveryDate: true, deliveredAt: true, totalPaise: true, revenuePaise: true, business: { select: { name: true } }, items: { select: { productSlug: true, quantity: true, unit: true } } },
      });
      return NextResponse.json({ ok: true, orders: rows }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) {
    console.error("mb.b2b.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load B2B data." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = requireMilkBusiness(req, "create");
  if (!g.ok) return g.res;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const actor = { actorId: g.userId, actorRole: g.role };
  try {
    if (action === "registerBusiness") {
      const biz = await registerBusiness(body.business ?? body, actor);
      return NextResponse.json({ ok: true, business: biz });
    }
    if (action === "create") {
      // Milk B2B order in KG (the private module's core). Server prices the line from
      // the business's BusinessPricing (KG rule / slab) — unitPricePaise is ignored.
      const kg = Math.max(0, Number(body.quantityKg) || 0);
      if (!body.businessId) return NextResponse.json({ error: "Select a business" }, { status: 400 });
      if (!(kg > 0)) return NextResponse.json({ error: "Enter KG greater than 0" }, { status: 400 });
      if (!body.deliveryDate) return NextResponse.json({ error: "Select a delivery date" }, { status: 400 });
      const order = await createOrder({
        businessId: body.businessId, deliveryDate: body.deliveryDate,
        deliveryTime: (body.deliveryTime as string) || "Morning (before 9 AM)",
        remarks: (body.remarks as string) || undefined,
        items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: kg, unit: "KG", unitPricePaise: 0 }],
      }, actor);
      return NextResponse.json({ ok: true, order });
    }
    if (action === "deliver") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const id = String(body.id);
      const cur = await db.businessOrder.findUnique({ where: { id }, select: { status: true } });
      if (!cur) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      // The engine enforces a sequential workflow — step through to DELIVERED (which
      // recognises revenue + draws FIFO milk COGS). Convenience for the private module.
      const flow = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
      const from = flow.indexOf(cur.status as (typeof flow)[number]);
      if (from < 0) return NextResponse.json({ error: `Cannot deliver from ${cur.status}` }, { status: 409 });
      for (let i = from + 1; i < flow.length; i++) await updateOrderStatus({ id, status: flow[i], ...actor });
      // re-fetch so the response reflects the post-commit revenue recognition
      const order = await db.businessOrder.findUnique({ where: { id }, select: { id: true, code: true, status: true, totalPaise: true, revenuePaise: true, deliveredAt: true } });
      return NextResponse.json({ ok: true, order });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
