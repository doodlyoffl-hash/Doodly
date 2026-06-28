/* /api/b2b/orders/[id] — Admin / Super-Admin only.
   GET                                              — full order (items, payments, invoice)
   PATCH { action: "status"|"cancel"|"reorder"|"pay"|"invoice", ... } */
import { NextRequest, NextResponse } from "next/server";
import {
  getOrder, updateOrderStatus, cancelOrder, reorder, recordPayment, generateInvoice,
} from "@/lib/b2b/service";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import type { B2BOrderStatus } from "@/lib/b2b/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const order = await getOrder(params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.order.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const a = { actorId: actorId(req), actorRole: role };
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    switch (body.action) {
      case "status":
        return NextResponse.json({ ok: true, order: await updateOrderStatus({ id: params.id, status: body.status as B2BOrderStatus, ...a }) });
      case "cancel":
        return NextResponse.json({ ok: true, order: await cancelOrder({ id: params.id, ...a }) });
      case "reorder":
        return NextResponse.json({ ok: true, order: await reorder({ id: params.id, ...a }) }, { status: 201 });
      case "pay":
        return NextResponse.json({ ok: true, order: await recordPayment({
          orderId: params.id, amountPaise: Number(body.amountPaise), method: String(body.method ?? "Cash"),
          reference: body.reference as string | undefined, note: body.note as string | undefined, ...a,
        }) });
      case "invoice":
        return NextResponse.json({ ok: true, invoice: await generateInvoice({ orderId: params.id, ...a }) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
