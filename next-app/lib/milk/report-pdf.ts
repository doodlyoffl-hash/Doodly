/* =============================================================
   DOODLY — Milk report PDF (pdf-lib, StandardFonts, landscape A4).
   One generic auto-fitting table renderer for every MilkReport type:
   column widths are measured from the content and scaled to the page, cells
   that still overflow are ellipsised, and rows paginate with a repeated header.
   StandardFonts are WinAnsi → ₹ becomes "Rs." and other non-ASCII is stripped.
   ============================================================= */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MilkReport } from "@/lib/milk/reports";

const A4L = { w: 841.89, h: 595.28 };
const FOREST = rgb(0.059, 0.239, 0.18);
const GOLD = rgb(0.851, 0.655, 0.255);
const INK = rgb(0.11, 0.153, 0.137);
const MUTE = rgb(0.42, 0.482, 0.451);
const LINE = rgb(0.886, 0.933, 0.933);
const ZEBRA = rgb(0.973, 0.984, 0.976);
const WHITE = rgb(1, 1, 1);

const safe = (s: string) => String(s ?? "").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, "").trim();

export async function renderMilkReportPdf(report: MilkReport): Promise<{ bytes: Uint8Array; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 36, size = 8.5, headSize = 8.5, usable = A4L.w - M * 2;

  // measure natural column widths (header + all cells + total), then scale to fit
  const pad = 10;
  const cols = report.columns.map((c, i) => {
    let w = bold.widthOfTextAtSize(safe(c.label), headSize);
    for (const r of report.rows) w = Math.max(w, font.widthOfTextAtSize(safe(r[i] ?? ""), size));
    if (report.totalRow) w = Math.max(w, bold.widthOfTextAtSize(safe(report.totalRow[i] ?? ""), size));
    return { right: !!c.right, label: c.label, w: w + pad };
  });
  const natural = cols.reduce((s, c) => s + c.w, 0);
  const scale = natural > usable ? usable / natural : 1;
  cols.forEach((c) => (c.w *= scale));
  const x: number[] = []; let acc = M;
  for (const c of cols) { x.push(acc); acc += c.w; }
  const rightEdge = A4L.w - M;

  const fit = (s: string, w: number, f: PDFFont, sz: number) => {
    let str = safe(s); if (f.widthOfTextAtSize(str, sz) <= w - 4) return str;
    while (str.length > 1 && f.widthOfTextAtSize(str + "…", sz) > w - 4) str = str.slice(0, -1);
    return str + "…";
  };
  const cell = (p: PDFPage, ci: number, s: string, y: number, f: PDFFont, color = INK) => {
    const c = cols[ci], txt = fit(s, c.w, f, size);
    if (c.right) p.drawText(txt, { x: x[ci] + c.w - 5 - f.widthOfTextAtSize(txt, size), y, size, font: f, color });
    else p.drawText(txt, { x: x[ci] + 5, y, size, font: f, color });
  };

  let page: PDFPage = doc.addPage([A4L.w, A4L.h]);
  const header = (p: PDFPage) => {
    const h = 70;
    p.drawRectangle({ x: 0, y: A4L.h - h, width: A4L.w, height: h, color: FOREST });
    p.drawRectangle({ x: 0, y: A4L.h - h - 3, width: A4L.w, height: 3, color: GOLD });
    p.drawText("DOODLY", { x: M, y: A4L.h - 34, size: 20, font: bold, color: WHITE });
    p.drawText("Pure | Fresh | Honest", { x: M, y: A4L.h - 50, size: 8.5, font, color: GOLD });
    const t = safe(report.title);
    p.drawText(t, { x: rightEdge - bold.widthOfTextAtSize(t, 13), y: A4L.h - 32, size: 13, font: bold, color: WHITE });
    const st = safe(report.subtitle);
    p.drawText(fit(st, usable, font, 8.5), { x: rightEdge - font.widthOfTextAtSize(fit(st, usable, font, 8.5), 8.5), y: A4L.h - 48, size: 8.5, font, color: rgb(0.85, 0.9, 0.87) });
  };
  const tableHead = (p: PDFPage, y: number) => {
    p.drawRectangle({ x: M, y: y - 6, width: usable, height: 20, color: FOREST });
    cols.forEach((c, i) => cell(p, i, c.label, y, bold, WHITE));
    return y - 22;
  };

  header(page);
  let y = A4L.h - 70 - 26;
  y = tableHead(page, y);
  if (!report.rows.length) { page.drawText("No data for this range.", { x: M + 6, y: y - 4, size: 10, font, color: MUTE }); y -= 20; }

  let zebra = false;
  for (const r of report.rows) {
    if (y < 60) { page = doc.addPage([A4L.w, A4L.h]); header(page); y = A4L.h - 70 - 26; y = tableHead(page, y); zebra = false; }
    if (zebra) page.drawRectangle({ x: M, y: y - 5, width: usable, height: 16, color: ZEBRA });
    zebra = !zebra;
    r.forEach((c, i) => cell(page, i, c, y, font));
    y -= 16;
    page.drawRectangle({ x: M, y: y + 5, width: usable, height: 0.4, color: LINE });
  }

  if (report.totalRow) {
    if (y < 60) { page = doc.addPage([A4L.w, A4L.h]); header(page); y = A4L.h - 70 - 26; y = tableHead(page, y); }
    y -= 4;
    page.drawRectangle({ x: M, y: y - 6, width: usable, height: 20, color: rgb(0.965, 0.976, 0.972) });
    report.totalRow.forEach((c, i) => cell(page, i, c, y, bold, FOREST));
    y -= 22;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 0, y: 0, width: A4L.w, height: 32, color: rgb(0.965, 0.976, 0.972) });
    p.drawText(safe(`Generated ${new Date().toLocaleString("en-IN")} - DOODLY Milk Profit Center`), { x: M, y: 12, size: 7.5, font, color: MUTE });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: rightEdge - font.widthOfTextAtSize(pg, 7.5), y: 12, size: 7.5, font, color: MUTE });
  });

  const bytes = await doc.save();
  return { bytes, filename: `DOODLY_Milk_${report.type}_${new Date().toISOString().slice(0, 10)}.pdf` };
}
