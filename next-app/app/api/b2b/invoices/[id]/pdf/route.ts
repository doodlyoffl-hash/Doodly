/* GET /api/b2b/invoices/[id]/pdf?token=…&dl=1
   Streams the branded Business-Invoice PDF (generated on demand).
   Access is granted to EITHER:
     • a valid signed invoice token (the emailed "View / Download" link), OR
     • an authenticated admin/staff with B2B permission.
   `dl=1` forces an attachment download; otherwise it opens inline. */
import { NextRequest, NextResponse } from "next/server";
import { renderInvoicePdfById } from "@/lib/b2b/invoice-email";
import { invoicePdfFilename } from "@/lib/b2b/invoice-pdf";
import { verifyInvoiceToken } from "@/lib/b2b/invoice-token";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const token = req.nextUrl.searchParams.get("token");
  const dl = req.nextUrl.searchParams.get("dl") === "1";

  // authorise: signed token for THIS invoice, or an authorised admin session
  let allowed = false;
  if (token) {
    const invId = await verifyInvoiceToken(token);
    allowed = invId === id;
  }
  if (!allowed && canUseB2B(actorRole(req))) allowed = true;
  if (!allowed) return NextResponse.json({ error: "This invoice link is invalid or has expired." }, { status: 401 });

  try {
    const pdf = await renderInvoicePdfById(id);
    if (!pdf) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const filename = pdf.filename || invoicePdfFilename(id);
    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${filename}"`,
        "Content-Length": String(pdf.bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("b2b.invoice.pdf", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the invoice PDF." }, { status: 500 });
  }
}
