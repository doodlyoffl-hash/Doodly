/* =============================================================
   DOODLY — Packing List PDF (pdf-lib, StandardFonts → no font files to ship).
   Mirrors the customer-invoice renderer's branding (forest header band + gold
   rule + zebra table). Print-ready for the dairy floor.
   ============================================================= */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { packingListReport, packingFilename, type PackingReport } from "./packing-report";

const A4 = { w: 595.28, h: 841.89 };
const FOREST = rgb(0.059, 0.239, 0.18);
const GOLD = rgb(0.851, 0.655, 0.255);
const INK = rgb(0.11, 0.153, 0.137);
const MUTE = rgb(0.42, 0.482, 0.451);
const LINE = rgb(0.886, 0.933, 0.933);
const ZEBRA = rgb(0.973, 0.984, 0.976);
const WHITE = rgb(1, 1, 1);
// StandardFonts are WinAnsi — strip anything outside the printable ASCII range.
const safe = (s: string) => (s || "").replace(/[^\x20-\x7E]/g, "").trim();
const fmtDay = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

export async function renderPackingListPdf(dateIso?: string | null): Promise<{ bytes: Uint8Array; filename: string; report: PackingReport }> {
  const report = await packingListReport(dateIso);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont, color = INK) => p.drawText(safe(s), { x, y, size, font: f, color });
  const rightText = (p: PDFPage, s: string, xRight: number, y: number, size: number, f: PDFFont, color = INK) => {
    const str = safe(s); p.drawText(str, { x: xRight - f.widthOfTextAtSize(str, size), y, size, font: f, color });
  };

  const M = 40;                                  // margin
  const colX = [M, M + 150, M + 235, M + 320, M + 395, M + 465];  // product, size, qty, litres, glass, caps
  const rightEdge = A4.w - M;

  const header = (p: PDFPage) => {
    const h = 84;
    p.drawRectangle({ x: 0, y: A4.h - h, width: A4.w, height: h, color: FOREST });
    p.drawRectangle({ x: 0, y: A4.h - h - 4, width: A4.w, height: 4, color: GOLD });
    text(p, "DOODLY", M, A4.h - 40, 22, bold, WHITE);
    text(p, "Pure | Fresh | Honest", M, A4.h - 58, 9, font, GOLD);
    rightText(p, "PACKING LIST", rightEdge, A4.h - 38, 15, bold, WHITE);
    rightText(p, fmtDay(report.date), rightEdge, A4.h - 56, 10, font, WHITE);
    rightText(p, `${report.stops} delivery stop(s)`, rightEdge, A4.h - 70, 9, font, GOLD);
  };
  const tableHead = (p: PDFPage, y: number) => {
    p.drawRectangle({ x: M, y: y - 6, width: rightEdge - M, height: 22, color: FOREST });
    text(p, "PRODUCT", colX[0] + 6, y, 8.5, bold, WHITE);
    text(p, "SIZE", colX[1], y, 8.5, bold, WHITE);
    rightText(p, "BOTTLES", colX[3] - 12, y, 8.5, bold, WHITE);
    rightText(p, "LITRES", colX[4] - 12, y, 8.5, bold, WHITE);
    rightText(p, "GLASS", colX[5] - 12, y, 8.5, bold, WHITE);
    rightText(p, "CAPS", rightEdge - 6, y, 8.5, bold, WHITE);
    return y - 24;
  };

  header(page);
  let y = A4.h - 84 - 34;
  text(page, "Fill and pack the following for tomorrow's route.", M, y, 9.5, font, MUTE);
  y -= 22;
  y = tableHead(page, y);

  if (!report.lines.length) {
    text(page, "No deliveries to pack for this day.", M + 6, y - 4, 10, font, MUTE);
    y -= 20;
  }

  let zebra = false;
  for (const l of report.lines) {
    if (y < 90) {                                  // new page
      page = doc.addPage([A4.w, A4.h]); header(page); y = A4.h - 84 - 34; y = tableHead(page, y); zebra = false;
    }
    if (zebra) page.drawRectangle({ x: M, y: y - 6, width: rightEdge - M, height: 18, color: ZEBRA });
    zebra = !zebra;
    text(page, l.productName, colX[0] + 6, y, 9.5, font);
    text(page, l.variantLabel, colX[1], y, 9.5, font);
    rightText(page, String(l.bottles), colX[3] - 12, y, 9.5, bold);
    rightText(page, String(l.litres), colX[4] - 12, y, 9.5, font);
    rightText(page, String(l.glassBottles), colX[5] - 12, y, 9.5, font);
    rightText(page, String(l.caps), rightEdge - 6, y, 9.5, font);
    y -= 18;
    page.drawRectangle({ x: M, y: y + 6, width: rightEdge - M, height: 0.5, color: LINE });
  }

  // ---- totals ----
  y -= 8;
  page.drawRectangle({ x: M, y: y - 8, width: rightEdge - M, height: 24, color: rgb(0.965, 0.976, 0.972) });
  text(page, "TOTAL", colX[0] + 6, y, 10, bold, FOREST);
  rightText(page, String(report.totals.bottles) + " bottles", colX[3] - 12, y, 10, bold, FOREST);
  rightText(page, String(report.totals.litres) + " L", colX[4] - 12, y, 10, bold, FOREST);
  rightText(page, String(report.totals.glassBottles), colX[5] - 12, y, 10, bold, FOREST);
  rightText(page, String(report.totals.caps), rightEdge - 6, y, 10, bold, FOREST);
  y -= 34;
  text(page, `Glass bottles required: ${report.totals.glassBottles}   |   Bottle caps: ${report.totals.caps}   |   Labels: ${report.totals.labels}`, M, y, 9, font, MUTE);

  // ---- footer on every page ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 0, y: 0, width: A4.w, height: 40, color: rgb(0.965, 0.976, 0.972) });
    text(p, `Generated ${new Date().toLocaleString("en-IN")} - DOODLY Operations`, M, 16, 8, font, MUTE);
    rightText(p, `Page ${i + 1} of ${pages.length}`, rightEdge, 16, 8, font, MUTE);
  });

  const bytes = await doc.save();
  return { bytes, filename: packingFilename(report.date, "pdf"), report };
}
