/* GET /api/invoices/[id]/pdf?dl=1 — streams the B2C customer invoice PDF
   (generated on demand). Authorised for the invoice's OWNER (customer session)
   OR an admin/staff with orders/billing view permission. `dl=1` forces an
   attachment download; otherwise it opens inline. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readUserId, readRole } from "@/lib/auth/identity";
import { can } from "@/lib/rbac";
import { renderCustomerInvoicePdfById } from "@/lib/orders/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const inv = await db.invoice.findUnique({ where: { id }, select: { userId: true } });
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const uid = readUserId(req);
  const role = readRole(req);
  const isOwner = !!uid && uid === inv.userId;
  const isStaff = can(role, "orders", "view") || can(role, "billing", "view");
  if (!isOwner && !isStaff) return NextResponse.json({ error: "You don't have access to this invoice." }, { status: 401 });

  const dl = req.nextUrl.searchParams.get("dl") === "1";
  try {
    const pdf = await renderCustomerInvoicePdfById(id);
    if (!pdf) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${pdf.filename}"`,
        "Content-Length": String(pdf.bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("invoice.pdf", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the invoice PDF." }, { status: 500 });
  }
}
