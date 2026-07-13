/* =============================================================
   DOODLY — B2C customer invoice PDF (pdf-lib, serverless-safe).
   Generated on demand from an Invoice + its Order. StandardFonts use
   WinAnsi encoding (no ₹ glyph) so amounts are printed as "Rs.".
   ============================================================= */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { db } from "@/lib/db";

const A4 = { w: 595.28, h: 841.89 };
const M = 44;
const FOREST = rgb(0.059, 0.239, 0.18);   // #0F3D2E
const GOLD = rgb(0.851, 0.655, 0.255);    // #D9A741
const INK = rgb(0.11, 0.153, 0.137);
const MUTE = rgb(0.42, 0.482, 0.451);
const LINE = rgb(0.886, 0.933, 0.933);
const GREEN = rgb(0.121, 0.682, 0.4);
const WHITE = rgb(1, 1, 1);

const rs = (paise: number) => "Rs. " + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const safe = (s: string) => (s || "").replace(/[^\x20-\x7E]/g, "").trim();

export function customerInvoiceFilename(number: string) { return "DOODLY_Invoice_" + number.replace(/\//g, "-") + ".pdf"; }

export async function renderCustomerInvoicePdfById(invoiceId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true, gstPaise: true, issuedAt: true, userId: true,
      user: { select: { name: true, email: true, phone: true } },
      order: {
        select: {
          id: true, type: true, createdAt: true,
          subtotalPaise: true, discountPaise: true, depositPaise: true, taxPaise: true, deliveryPaise: true, totalPaise: true,
          items: { select: { productName: true, variantLabel: true, quantity: true, unitPricePaise: true, lineTotalPaise: true } },
        },
      },
    },
  });
  if (!inv || !inv.order) return null;
  const addr = await db.address.findFirst({
    where: { userId: inv.userId },
    orderBy: { isDefault: "desc" },
    select: { line1: true, line2: true, area: true, city: true, state: true, pincode: true },
  });

  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.w, A4.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (s: string, x: number, y: number, size: number, f: PDFFont, color = INK) => page.drawText(safe(s), { x, y, size, font: f, color });
  const rightText = (s: string, xRight: number, y: number, size: number, f: PDFFont, color = INK) => {
    const str = safe(s); page.drawText(str, { x: xRight - f.widthOfTextAtSize(str, size), y, size, font: f, color });
  };

  // ---- header band ----
  const headH = 96;
  page.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: headH, color: FOREST });
  page.drawRectangle({ x: 0, y: A4.h - headH - 4, width: A4.w, height: 4, color: GOLD });
  text("DOODLY", M, A4.h - 52, 26, bold, WHITE);
  text("A2 Buffalo Milk  |  Glass Bottles  |  Delivered by 7 AM", M, A4.h - 72, 8.5, font, rgb(0.8, 0.87, 0.83));
  rightText("TAX INVOICE", A4.w - M, A4.h - 44, 15, bold, GOLD);
  rightText("Invoice " + inv.number, A4.w - M, A4.h - 62, 9.5, font, WHITE);
  rightText("Issued " + fmtDate(inv.issuedAt), A4.w - M, A4.h - 76, 8.5, font, rgb(0.8, 0.87, 0.83));

  let y = A4.h - headH - 34;

  // ---- bill-to ----
  text("BILL TO", M, y, 8.5, bold, MUTE);
  y -= 16;
  text(inv.user?.name || "Customer", M, y, 12, bold);
  y -= 14;
  const contact = [inv.user?.phone, inv.user?.email].filter(Boolean).join("  |  ");
  if (contact) { text(contact, M, y, 9, font, MUTE); y -= 13; }
  if (addr) {
    const l1 = safe([addr.line1, addr.line2].filter(Boolean).join(", "));
    const l2 = safe([addr.area, addr.city, addr.state, addr.pincode].filter(Boolean).join(", "));
    if (l1) { text(l1, M, y, 9, font, MUTE); y -= 12; }
    if (l2) { text(l2, M, y, 9, font, MUTE); y -= 12; }
  }
  // order ref (right column)
  rightText("Order  DOO-" + inv.order.id.slice(-6).toUpperCase(), A4.w - M, A4.h - headH - 34, 9, font, MUTE);
  rightText("Order date  " + fmtDate(inv.order.createdAt), A4.w - M, A4.h - headH - 48, 9, font, MUTE);
  const payChip = "PAID";
  rightText(payChip, A4.w - M, A4.h - headH - 66, 11, bold, GREEN);

  y -= 12;

  // ---- items table ----
  const tableX = M, tableW = A4.w - 2 * M;
  const colQty = tableX + tableW - 210, colRate = tableX + tableW - 130, colAmt = tableX + tableW;
  page.drawRectangle({ x: tableX, y: y - 6, width: tableW, height: 22, color: FOREST });
  text("ITEM", tableX + 10, y, 9, bold, WHITE);
  rightText("QTY", colQty + 30, y, 9, bold, WHITE);
  rightText("RATE", colRate + 40, y, 9, bold, WHITE);
  rightText("AMOUNT", colAmt - 8, y, 9, bold, WHITE);
  y -= 26;

  for (const it of inv.order.items) {
    const name = safe(it.productName + (it.variantLabel ? " " + it.variantLabel : ""));
    text(name.slice(0, 60), tableX + 10, y, 9.5, font);
    rightText(String(it.quantity), colQty + 30, y, 9.5, font);
    rightText(rs(it.unitPricePaise), colRate + 40, y, 9.5, font);
    rightText(rs(it.lineTotalPaise), colAmt - 8, y, 9.5, font);
    y -= 8;
    page.drawRectangle({ x: tableX, y: y, width: tableW, height: 0.6, color: LINE });
    y -= 14;
  }

  // ---- totals ----
  y -= 6;
  const totRow = (label: string, value: string, strong = false, color = INK) => {
    text(label, colRate - 40, y, strong ? 10.5 : 9.5, strong ? bold : font, strong ? INK : MUTE);
    rightText(value, colAmt - 8, y, strong ? 10.5 : 9.5, strong ? bold : font, color);
    y -= strong ? 18 : 15;
  };
  totRow("Subtotal", rs(inv.order.subtotalPaise));
  if (inv.order.discountPaise > 0) totRow("Discount", "- " + rs(inv.order.discountPaise), false, GREEN);
  if (inv.order.deliveryPaise > 0) totRow("Delivery", rs(inv.order.deliveryPaise));
  if (inv.order.depositPaise > 0) totRow("Bottle deposit (refundable)", rs(inv.order.depositPaise));
  totRow("GST", rs(inv.gstPaise));
  page.drawRectangle({ x: colRate - 40, y: y + 6, width: colAmt - (colRate - 40) - 8 + 8, height: 0.8, color: LINE });
  y -= 6;
  totRow("TOTAL PAID", rs(inv.order.totalPaise), true, FOREST);

  // ---- footer ----
  const gstin = process.env.DOODLY_GSTIN;
  const fy = M;
  page.drawRectangle({ x: 0, y: 0, width: A4.w, height: 46, color: rgb(0.965, 0.976, 0.972) });
  text("Thank you for choosing DOODLY. This is a computer-generated invoice and needs no signature.", fy, 28, 8, font, MUTE);
  text(gstin ? "GSTIN: " + safe(gstin) : "DOODLY Dairy", fy, 15, 8, font, MUTE);
  rightText("doodly.in", A4.w - M, 15, 8.5, bold, FOREST);

  const bytes = await doc.save();
  return { bytes, filename: customerInvoiceFilename(inv.number) };
}
