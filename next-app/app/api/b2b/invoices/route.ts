/* /api/b2b/invoices — Admin / Super-Admin only.
   GET  ?status=&businessId=&productSlug=&q=&from=&to=&amountFrom=&amountTo=&overdue=&sort=&limit=&offset=
   POST { orderId, dueDate?, notes?, terms? }  — issue an invoice for an order. */
import { NextRequest, NextResponse } from "next/server";
import { listInvoices, createInvoiceForOrder, type InvoiceSort } from "@/lib/b2b/invoices";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const result = await listInvoices({
      status: sp.get("status") ?? undefined,
      businessId: sp.get("businessId") ?? undefined,
      productSlug: sp.get("productSlug") ?? undefined,
      q: sp.get("q") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      amountFromPaise: sp.get("amountFrom") ? Math.round(Number(sp.get("amountFrom")) * 100) : undefined,
      amountToPaise: sp.get("amountTo") ? Math.round(Number(sp.get("amountTo")) * 100) : undefined,
      overdue: sp.get("overdue") === "1",
      sort: (sp.get("sort") as InvoiceSort) ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoices.list", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load invoices." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { orderId?: string; dueDate?: string; notes?: string; terms?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.orderId) return NextResponse.json({ error: "Select an order to invoice" }, { status: 400 });
  try {
    const invoice = await createInvoiceForOrder({ orderId: body.orderId, dueDate: body.dueDate, notes: body.notes, terms: body.terms, actorId: actorId(req), actorRole: role, ip: ipOf(req) });
    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create invoice" }, { status: 409 });
  }
}
