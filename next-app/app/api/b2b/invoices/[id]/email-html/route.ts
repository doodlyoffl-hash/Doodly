/* GET /api/b2b/invoices/[id]/email-html?dl=1
   Renders the exact branded invoice email HTML for an invoice — so admins can
   preview or download the message that was (or would be) sent. Admin/staff with
   B2B permission only. `dl=1` downloads the .html; otherwise it opens inline. */
import { NextRequest, NextResponse } from "next/server";
import { renderInvoiceEmailById } from "@/lib/b2b/invoice-email";
import { invoicePdfFilename } from "@/lib/b2b/invoice-pdf";
import { actorRole, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dl = req.nextUrl.searchParams.get("dl") === "1";
  try {
    const email = await renderInvoiceEmailById(params.id);
    if (!email) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const filename = invoicePdfFilename(params.id).replace(/\.pdf$/i, "") + "_email.html";
    return new NextResponse(email.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(dl ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("b2b.invoice.email-html", (e as Error)?.message);
    return NextResponse.json({ error: "Could not render the invoice email." }, { status: 500 });
  }
}
