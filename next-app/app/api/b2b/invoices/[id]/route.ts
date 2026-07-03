/* /api/b2b/invoices/[id] — Admin / Super-Admin only.
   GET                                                          — invoice detail (items, payments, audit)
   PATCH { action: "void"|"update"|"pay"|"pdf"|"export", ... } */
import { NextRequest, NextResponse } from "next/server";
import { getInvoiceDetail, voidInvoice, updateInvoice, recordInvoicePayment, logInvoiceAction } from "@/lib/b2b/invoices";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const invoice = await getInvoiceDetail(params.id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ invoice }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.invoice.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load invoice." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const a = { actorId: actorId(req), actorRole: role, ip: ipOf(req) };
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    switch (body.action) {
      case "void":
        return NextResponse.json({ ok: true, invoice: await voidInvoice(params.id, a) });
      case "update":
        return NextResponse.json({ ok: true, invoice: await updateInvoice(params.id, (body.patch ?? {}) as { dueDate?: string | null; notes?: string; terms?: string }, a) });
      case "pay":
        return NextResponse.json({ ok: true, invoice: await recordInvoicePayment(params.id, { amountPaise: Math.round(Number(body.amountPaise) || 0), method: String(body.method ?? "Cash"), reference: body.reference as string | undefined, note: body.note as string | undefined, ...a }) });
      case "pdf":
        return NextResponse.json({ ok: true, result: await logInvoiceAction(params.id, "pdf", a) });
      case "export":
        return NextResponse.json({ ok: true, result: await logInvoiceAction(params.id, "export", a) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
