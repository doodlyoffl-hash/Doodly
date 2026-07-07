/* =============================================================
   Business Invoice -> PDF (server-side, serverless-safe).
   Uses pdf-lib (pure-JS, no native deps, no external font files)
   so it bundles and runs on Vercel Node functions. Draws a clean,
   branded DOODLY tax invoice from the shape returned by
   getInvoiceDetail() in lib/b2b/invoices.ts.

   NOTE: pdf-lib's StandardFonts use WinAnsi encoding, which cannot
   encode the rupee glyph (U+20B9) -- so money in the PDF is prefixed
   "Rs." (the HTML email keeps the rupee sign). All drawn text is
   passed through safe() to stay WinAnsi-encodable.
   ============================================================= */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

// ---- input shape (subset of getInvoiceDetail) ----
export interface InvoicePdfData {
  number: string;
  status: string;                 // ISSUED | PARTIAL | PAID | VOID
  paymentStatus: string;          // PAID | PARTIAL | PENDING | OVERDUE | VOID
  issuedAt: string;               // ISO
  dueDate: string | null;         // ISO
  notes?: string | null;
  terms?: string | null;
  gstPaise: number;
  order: {
    code: string; deliveryDate: string; deliveryTime?: string | null;
    subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number; paidPaise: number; paymentTerm: string;
  };
  business: {
    code: string; name: string; gst?: string | null; pan?: string | null;
    contactPerson: string; mobile: string; email?: string | null;
    line1: string; city: string; state: string; pincode: string; billingAddress?: string | null;
  };
  items: { productName: string; quantity: number; unit: string; unitPricePaise: number; lineTotalPaise: number }[];
}

// ---- brand palette (matches the email design system) ----
const FOREST = rgb(0.059, 0.239, 0.18);    // #0F3D2E
const DEEPBLUE = rgb(0.071, 0.227, 0.353); // #123A5A
const GOLD = rgb(0.851, 0.655, 0.255);     // #D9A741
const INK = rgb(0.11, 0.153, 0.137);
const MUTE = rgb(0.42, 0.482, 0.451);
const LINE = rgb(0.886, 0.933, 0.933);
const WHITE = rgb(1, 1, 1);
const paidGreen = rgb(0.121, 0.682, 0.4);
const amber = rgb(0.85, 0.6, 0.05);
const red = rgb(0.75, 0.23, 0.17);

const A4 = { w: 595.28, h: 841.89 };
const M = 44; // page margin

function rs(paise: number): string {
  const v = (paise || 0) / 100;
  return "Rs. " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "-"; }
}
// Keep drawn text WinAnsi-encodable: ASCII-printable + Latin-1 (0xA0-0xFF).
// Strips control chars, the undefined 0x80-0x9F slots, and anything above
// 0xFF (e.g. the rupee sign) that the standard fonts cannot encode.
function safe(s: string): string {
  return String(s == null ? "" : s).replace(/₹/g, "Rs.").replace(/[^\x20-\x7E\xA0-\xFF]/g, "").trim();
}

function statusColor(s: string) {
  const u = s.toUpperCase();
  if (u === "PAID") return paidGreen;
  if (u === "PARTIAL") return amber;
  if (u === "OVERDUE" || u === "VOID") return red;
  return DEEPBLUE;
}

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`DOODLY Invoice ${d.number}`);
  doc.setAuthor("DOODLY");
  doc.setSubject(`Tax invoice ${d.number}`);
  doc.setProducer("DOODLY");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.w, A4.h]);

  const text = (pg: PDFPage, s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    pg.drawText(safe(s), { x, y: yy, size, font: f, color });
  const rightText = (pg: PDFPage, s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color = INK) => {
    const str = safe(s); const w = f.widthOfTextAtSize(str, size);
    pg.drawText(str, { x: xRight - w, y: yy, size, font: f, color });
  };
  const truncate = (s: string, f: PDFFont, size: number, maxW: number) => {
    let str = safe(s); if (f.widthOfTextAtSize(str, size) <= maxW) return str;
    while (str.length > 1 && f.widthOfTextAtSize(str + "...", size) > maxW) str = str.slice(0, -1);
    return str + "...";
  };

  // ---------- header band ----------
  const headH = 96;
  page.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: headH, color: FOREST });
  page.drawRectangle({ x: 0, y: A4.h - headH - 5, width: A4.w, height: 5, color: GOLD });
  text(page, "DOODLY", M, A4.h - 46, 30, bold, WHITE);
  text(page, "Pure by Choice.", M, A4.h - 66, 11, font, GOLD);
  text(page, "A2 Buffalo Milk  |  Glass Bottles  |  Delivered by 7 AM", M, A4.h - 82, 8.5, font, rgb(0.8, 0.87, 0.83));
  rightText(page, "TAX INVOICE", A4.w - M, A4.h - 46, 18, bold, WHITE);
  rightText(page, d.number, A4.w - M, A4.h - 64, 10, font, GOLD);
  rightText(page, "Issued " + fmtDate(d.issuedAt), A4.w - M, A4.h - 80, 8.5, font, rgb(0.8, 0.87, 0.83));

  let y = A4.h - headH - 34;

  // ---------- parties: billed to (left) + invoice meta (right) ----------
  const colR = A4.w / 2 + 12;
  text(page, "BILLED TO", M, y, 8.5, bold, MUTE);
  text(page, "INVOICE DETAILS", colR, y, 8.5, bold, MUTE);
  y -= 16;
  text(page, truncate(d.business.name, bold, 12, colR - M - 14), M, y, 12, bold, INK);
  // meta rows (right column) as label/value
  const meta: [string, string][] = [
    ["Invoice No", d.number],
    ["Order No", d.order.code],
    ["Invoice Date", fmtDate(d.issuedAt)],
    ["Due Date", fmtDate(d.dueDate)],
    ["Payment Term", d.order.paymentTerm],
  ];
  let my = y;
  for (const [k, v] of meta) {
    text(page, k, colR, my, 9, font, MUTE);
    rightText(page, v, A4.w - M, my, 9, bold, INK);
    my -= 14;
  }
  // business block (left column)
  y -= 15;
  const bizLines = [
    "Business ID: " + d.business.code,
    "Contact: " + d.business.contactPerson,
    "Mobile: " + d.business.mobile,
    ...(d.business.email ? ["Email: " + d.business.email] : []),
    ...(d.business.gst ? ["GST: " + d.business.gst] : []),
    ...(d.business.pan ? ["PAN: " + d.business.pan] : []),
    (d.business.billingAddress || [d.business.line1, d.business.city, d.business.state + " " + d.business.pincode].filter(Boolean).join(", ")),
  ];
  for (const l of bizLines) { text(page, truncate(l, font, 9, colR - M - 14), M, y, 9, font, l.startsWith("GST") || l.startsWith("PAN") ? INK : MUTE); y -= 13; }

  y = Math.min(y, my) - 14;

  // ---------- items table ----------
  const tableX = M, tableW = A4.w - M * 2;
  const cols = { name: M + 6, qty: M + tableW * 0.55, price: M + tableW * 0.75, amt: A4.w - M - 6 };
  // header row
  page.drawRectangle({ x: tableX, y: y - 6, width: tableW, height: 22, color: FOREST });
  text(page, "PRODUCT", cols.name, y, 8.5, bold, WHITE);
  rightText(page, "QTY", cols.qty + 24, y, 8.5, bold, WHITE);
  rightText(page, "UNIT PRICE", cols.price + 42, y, 8.5, bold, WHITE);
  rightText(page, "AMOUNT", cols.amt, y, 8.5, bold, WHITE);
  y -= 24;
  for (const it of d.items) {
    text(page, truncate(it.productName, font, 9.5, tableW * 0.5), cols.name, y, 9.5, font, INK);
    rightText(page, `${it.quantity} ${it.unit}`, cols.qty + 24, y, 9.5, font, MUTE);
    rightText(page, rs(it.unitPricePaise), cols.price + 42, y, 9.5, font, MUTE);
    rightText(page, rs(it.lineTotalPaise), cols.amt, y, 9.5, bold, INK);
    y -= 10;
    page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 0.5, color: LINE });
    y -= 12;
  }

  // ---------- totals ----------
  y -= 6;
  const totLabelR = A4.w - M - 96, totValR = A4.w - M, totX = totValR - 220;
  const totals: [string, string, boolean][] = [
    ["Subtotal", rs(d.order.subtotalPaise), false],
    ...(d.order.discountPaise > 0 ? [["Discount", "- " + rs(d.order.discountPaise), false] as [string, string, boolean]] : []),
    ["GST", rs(d.gstPaise || d.order.taxPaise), false],
    ["Grand Total", rs(d.order.totalPaise), true],
    ...(d.order.paidPaise > 0 ? [["Paid", rs(d.order.paidPaise), false] as [string, string, boolean]] : []),
    ...(d.order.totalPaise - d.order.paidPaise > 0 ? [["Balance Due", rs(d.order.totalPaise - d.order.paidPaise), false] as [string, string, boolean]] : []),
  ];
  for (const [k, v, strong] of totals) {
    if (strong) page.drawLine({ start: { x: totX, y: y + 12 }, end: { x: totValR, y: y + 12 }, thickness: 0.8, color: LINE });
    rightText(page, k, totLabelR, y, strong ? 11 : 9.5, strong ? bold : font, strong ? FOREST : MUTE);
    rightText(page, v, totValR, y, strong ? 12 : 9.5, strong ? bold : font, strong ? FOREST : INK);
    y -= strong ? 20 : 15;
  }

  // ---------- payment status badge ----------
  y -= 4;
  const badge = d.paymentStatus.toUpperCase();
  const bcol = statusColor(badge);
  const bw = bold.widthOfTextAtSize(badge, 10) + 22;
  page.drawRectangle({ x: M, y: y - 4, width: bw, height: 20, color: bcol, opacity: 0.12 });
  page.drawRectangle({ x: M, y: y - 4, width: 3, height: 20, color: bcol });
  text(page, badge, M + 11, y + 1, 10, bold, bcol);

  // ---------- notes / terms ----------
  y -= 30;
  if (d.notes) { text(page, "Notes: " + truncate(d.notes, font, 9, tableW - 40), M, y, 9, font, MUTE); y -= 14; }
  if (d.terms) { text(page, "Terms: " + truncate(d.terms, font, 9, tableW - 40), M, y, 9, font, MUTE); y -= 14; }

  // ---------- footer ----------
  const fy = 70;
  page.drawLine({ start: { x: M, y: fy + 22 }, end: { x: A4.w - M, y: fy + 22 }, thickness: 0.8, color: LINE });
  text(page, "SUBADHAAM MILK DAIRY Pvt. Ltd.", M, fy + 6, 9, bold, FOREST);
  text(page, "Krishnalanka, Vijayawada, Andhra Pradesh 520013", M, fy - 6, 8, font, MUTE);
  text(page, "Support: +91 91177 99143  |  doodlyoffl@gmail.com  |  www.doodly.in", M, fy - 18, 8, font, MUTE);
  rightText(page, "This is a computer-generated invoice.", A4.w - M, fy - 6, 8, font, MUTE);
  rightText(page, "Thank you for choosing DOODLY.", A4.w - M, fy + 6, 8.5, bold, GOLD);

  return doc.save();
}

/** Standard filename, e.g. DOODLY_Invoice_DOODLY-B2B-2026-00001.pdf (slashes -> hyphens). */
export function invoicePdfFilename(invoiceNumber: string): string {
  return "DOODLY_Invoice_" + String(invoiceNumber).replace(/[\\/\s]+/g, "-") + ".pdf";
}
