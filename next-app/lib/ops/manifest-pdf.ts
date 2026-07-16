/* =============================================================
   DOODLY — Delivery Manifest PDF (landscape A4, pdf-lib + StandardFonts).
   A real dispatch sheet: grouped into rounds per executive, wrapped addresses,
   variable row heights, repeating header/table head across pages.
   Branding mirrors lib/orders/invoice-pdf.ts (forest band + gold rule + zebra).
   ============================================================= */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { manifestReport, manifestFilename, type ManifestReport, type ManifestRow } from "./manifest-report";

const A4L = { w: 841.89, h: 595.28 };            // landscape
const FOREST = rgb(0.059, 0.239, 0.18);
const GOLD = rgb(0.851, 0.655, 0.255);
const INK = rgb(0.11, 0.153, 0.137);
const MUTE = rgb(0.42, 0.482, 0.451);
const LINE = rgb(0.886, 0.933, 0.933);
const ZEBRA = rgb(0.973, 0.984, 0.976);
const AMBER = rgb(0.663, 0.475, 0.106);
const WHITE = rgb(1, 1, 1);
const M = 32;

// StandardFonts are WinAnsi-only — drop anything outside printable ASCII.
const safe = (s: string) => (s || "").replace(/[^\x20-\x7E]/g, "").trim();
const fmtDay = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

/** Greedy word-wrap to a pixel width; hard-breaks any single word that can't fit. */
function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = safe(s).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; continue; }
    if (cur) lines.push(cur);
    if (font.widthOfTextAtSize(w, size) > maxW) {      // word longer than the column
      let chunk = "";
      for (const ch of w) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxW) { if (chunk) lines.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      cur = chunk;
    } else cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function renderManifestPdf(dateIso?: string | null): Promise<{ bytes: Uint8Array; filename: string; report: ManifestReport }> {
  const report = await manifestReport(dateIso);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // column x + width
  const W = A4L.w - M * 2;
  const cols = [
    { k: "seq", t: "#", w: 20 },
    { k: "order", t: "ORDER", w: 62 },
    { k: "cust", t: "CUSTOMER", w: 104 },
    { k: "addr", t: "ADDRESS", w: 208 },
    { k: "prod", t: "PRODUCTS", w: 118 },
    { k: "btl", t: "BTL", w: 26 },
    { k: "type", t: "TYPE", w: 62 },
    { k: "slot", t: "SLOT", w: 64 },
    { k: "note", t: "INSTRUCTIONS", w: W - (20 + 62 + 104 + 208 + 118 + 26 + 62 + 64) },
  ];
  const x: number[] = []; let acc = M;
  for (const c of cols) { x.push(acc); acc += c.w; }

  let page: PDFPage = doc.addPage([A4L.w, A4L.h]);
  const T = (p: PDFPage, s: string, px: number, py: number, size: number, f: PDFFont, color = INK) => p.drawText(safe(s), { x: px, y: py, size, font: f, color });
  const R = (p: PDFPage, s: string, xr: number, py: number, size: number, f: PDFFont, color = INK) => { const t = safe(s); p.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: py, size, font: f, color }); };

  const header = (p: PDFPage) => {
    const h = 62;
    p.drawRectangle({ x: 0, y: A4L.h - h, width: A4L.w, height: h, color: FOREST });
    p.drawRectangle({ x: 0, y: A4L.h - h - 3, width: A4L.w, height: 3, color: GOLD });
    T(p, "DOODLY", M, A4L.h - 30, 18, bold, WHITE);
    T(p, "Pure | Fresh | Honest", M, A4L.h - 45, 8, font, GOLD);
    R(p, "DELIVERY MANIFEST", A4L.w - M, A4L.h - 28, 13, bold, WHITE);
    R(p, `${fmtDay(report.date)}  -  ${report.totals.stops} stop(s), ${report.totals.bottles} bottle(s), ${report.totals.litres} L`, A4L.w - M, A4L.h - 44, 8.5, font, WHITE);
  };
  const tableHead = (p: PDFPage, y: number) => {
    p.drawRectangle({ x: M, y: y - 5, width: W, height: 18, color: FOREST });
    cols.forEach((c, i) => {
      if (c.k === "btl") R(p, c.t, x[i] + c.w - 4, y, 7.5, bold, WHITE);
      else T(p, c.t, x[i] + 3, y, 7.5, bold, WHITE);
    });
    return y - 20;
  };
  const newPage = () => { page = doc.addPage([A4L.w, A4L.h]); header(page); return tableHead(page, A4L.h - 62 - 22); };

  header(page);
  let y = A4L.h - 62 - 22;
  y = tableHead(page, y);

  if (!report.rows.length) { T(page, "No deliveries scheduled for this day.", M + 4, y - 4, 10, font, MUTE); y -= 18; }

  const SZ = 8;            // body font size
  const LH = 9.2;          // line height
  let zebra = false;
  let lastExec: string | null = null;

  for (const r of report.rows) {
    // ---- round band when the executive changes ----
    if (r.executive !== lastExec) {
      const g = report.byExecutive.find((e) => e.executive === r.executive);
      if (y < 92) y = newPage();
      y -= 6;
      const unassigned = r.executive === "Unassigned";
      page.drawRectangle({ x: M, y: y - 5, width: W, height: 17, color: unassigned ? rgb(1, 0.973, 0.918) : rgb(0.929, 0.965, 0.945) });
      T(page, (unassigned ? "! " : "") + (unassigned ? "UNASSIGNED - needs an executive" : "ROUND - " + r.executive), M + 4, y, 8.5, bold, unassigned ? AMBER : FOREST);
      R(page, `${g?.stops ?? 0} stop(s) - ${g?.bottles ?? 0} bottle(s)`, M + W - 4, y, 8, font, unassigned ? AMBER : FOREST);
      y -= 20;
      lastExec = r.executive;
      zebra = false;
    }

    // ---- measure the row (wrapped cells drive the height) ----
    const addr = wrap(r.address + (r.landmark ? " (near " + r.landmark + ")" : ""), font, SZ, cols[3].w - 6);
    const prod = wrap(r.products, font, SZ, cols[4].w - 6);
    const note = wrap(r.instructions || "-", font, SZ, cols[8].w - 6);
    const cust = [r.customer, r.mobile];
    const rowH = Math.max(addr.length, prod.length, note.length, cust.length) * LH + 6;

    if (y - rowH < 56) { y = newPage(); zebra = false; }

    if (zebra) page.drawRectangle({ x: M, y: y - rowH + LH - 1, width: W, height: rowH, color: ZEBRA });
    zebra = !zebra;

    const top = y;
    T(page, String(r.seq), x[0] + 3, top, SZ, font, MUTE);
    T(page, r.orderRef, x[1] + 3, top, SZ, bold);
    T(page, cust[0], x[2] + 3, top, SZ, bold);
    T(page, cust[1], x[2] + 3, top - LH, SZ, font, MUTE);
    addr.forEach((l, i) => T(page, l, x[3] + 3, top - i * LH, SZ, font));
    prod.forEach((l, i) => T(page, l, x[4] + 3, top - i * LH, SZ, font));
    R(page, String(r.bottles), x[5] + cols[5].w - 4, top, SZ, bold);
    T(page, r.type, x[6] + 3, top, SZ, font);
    if (r.plan && r.plan !== "—") T(page, r.plan, x[6] + 3, top - LH, SZ - 0.8, font, MUTE);
    T(page, r.slot, x[7] + 3, top, SZ, font);
    note.forEach((l, i) => T(page, l, x[8] + 3, top - i * LH, SZ, font, r.instructions ? INK : MUTE));

    y -= rowH;
    page.drawRectangle({ x: M, y: y + LH - 1, width: W, height: 0.4, color: LINE });
  }

  // ---- totals + signature strip ----
  if (y < 90) y = newPage();
  y -= 10;
  page.drawRectangle({ x: M, y: y - 8, width: W, height: 22, color: rgb(0.965, 0.976, 0.972) });
  T(page, `TOTAL - ${report.totals.stops} stop(s), ${report.totals.customers} customer(s), ${report.totals.bottles} bottle(s), ${report.totals.litres} L`
    + (report.totals.unassigned ? `   |   ${report.totals.unassigned} UNASSIGNED` : ""), M + 4, y, 9, bold, FOREST);
  y -= 34;
  T(page, "Executive signature: ______________________        Bottles out: ________        Empties collected: ________        Cash collected: ________", M, y, 8.5, font, MUTE);

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawRectangle({ x: 0, y: 0, width: A4L.w, height: 30, color: rgb(0.965, 0.976, 0.972) });
    T(p, `Generated ${new Date().toLocaleString("en-IN")} - DOODLY Operations`, M, 12, 7.5, font, MUTE);
    R(p, `Page ${i + 1} of ${pages.length}`, A4L.w - M, 12, 7.5, font, MUTE);
  });

  const bytes = await doc.save();
  return { bytes, filename: manifestFilename(report.date, "pdf"), report };
}
