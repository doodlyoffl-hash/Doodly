/* =============================================================
   DOODLY — Packing List report (product-aggregated, per IST delivery day).
   The packing BOARD (lib/delivery/packing.ts) is per-stop — what each executive
   carries. This is the dairy's view: how much of each product/bottle size to fill
   for the whole day, plus the glass bottles, caps and labels needed.
   Volume uses the real bottle size (Variant.ml) — never bottles-as-litres.
   ============================================================= */
import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";

const CLOSED: DeliveryStatus[] = ["DELIVERED", "FAILED", "SKIPPED"];
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

export interface PackingLine {
  productName: string;
  variantLabel: string;
  ml: number;
  bottles: number;          // bottles to fill of this size
  litres: number;           // bottles × ml ÷ 1000
  glassBottles: number;     // returnable glass bottles required (1 per bottle)
  caps: number;             // 1 cap per bottle
  labels: number;           // future-ready — 1 label per bottle
}
export interface PackingReport {
  date: string;
  stops: number;            // delivery stops to pack for
  lines: PackingLine[];
  totals: { bottles: number; litres: number; glassBottles: number; caps: number; labels: number };
}

/** Aggregate the day's deliveries into a product × bottle-size packing list. */
export async function packingListReport(dateIso?: string | null): Promise<PackingReport> {
  const { start, end, iso } = istDayWindow(dateIso);
  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: CLOSED } },
      select: {
        id: true, bottleCount: true,
        subscription: { select: { items: { select: { qty: true, variant: { select: { ml: true, label: true, product: { select: { name: true } } } } } } } },
        order: { select: { items: { select: { productName: true, variantLabel: true, productSlug: true } } } },
      },
      take: 5000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true, name: true } } } }),
  ]);

  const byKey = new Map<string, { ml: number; label: string; name: string }>();
  for (const v of variants) if (v.product?.slug) byKey.set(`${v.product.slug}|${normLabel(v.label)}`, { ml: v.ml, label: v.label, name: v.product.name });

  const lines = new Map<string, PackingLine>();
  const add = (productName: string, variantLabel: string, ml: number, bottles: number) => {
    if (bottles <= 0) return;
    const k = `${productName}|${variantLabel}`;
    const cur = lines.get(k) ?? { productName, variantLabel, ml, bottles: 0, litres: 0, glassBottles: 0, caps: 0, labels: 0 };
    cur.bottles += bottles;
    cur.litres = Math.round((cur.bottles * cur.ml / 1000) * 100) / 100;
    cur.glassBottles = cur.bottles; cur.caps = cur.bottles; cur.labels = cur.bottles;
    lines.set(k, cur);
  };

  for (const d of rows) {
    const subItems = d.subscription?.items ?? [];
    if (subItems.length) {
      // subscription: each item carries its own variant + bottles-per-delivery
      for (const i of subItems) add(i.variant.product?.name ?? "Milk", i.variant.label, i.variant.ml, i.qty);
      continue;
    }
    // one-time / trial: OrderItem has no variantId — resolve the label against the
    // catalogue; bottles on THIS stop is Delivery.bottleCount (not OrderItem.quantity,
    // which is the order-level total of days × bottles).
    const oi = (d.order?.items ?? [])[0];
    if (!oi) continue;
    const hit = byKey.get(`${oi.productSlug}|${normLabel(oi.variantLabel)}`);
    add(oi.productName ?? hit?.name ?? "Milk", oi.variantLabel ?? hit?.label ?? "—", hit?.ml ?? 1000, d.bottleCount || 1);
  }

  const out = [...lines.values()].sort((a, b) => b.bottles - a.bottles || a.ml - b.ml);
  const totals = out.reduce((t, l) => ({
    bottles: t.bottles + l.bottles, litres: Math.round((t.litres + l.litres) * 100) / 100,
    glassBottles: t.glassBottles + l.glassBottles, caps: t.caps + l.caps, labels: t.labels + l.labels,
  }), { bottles: 0, litres: 0, glassBottles: 0, caps: 0, labels: 0 });

  return { date: iso, stops: rows.length, lines: out, totals };
}

// ---------- exports ----------
export function packingFilename(date: string, ext: string) { return `DOODLY_Packing_List_${date}.${ext}`; }

const HEAD = ["Product", "Bottle size", "Quantity (bottles)", "Total litres", "Glass bottles", "Bottle caps", "Labels"];
const rowsOf = (r: PackingReport) => r.lines.map((l) => [l.productName, l.variantLabel, String(l.bottles), String(l.litres), String(l.glassBottles), String(l.caps), String(l.labels)]);
const totalRow = (r: PackingReport) => ["TOTAL", "", String(r.totals.bottles), String(r.totals.litres), String(r.totals.glassBottles), String(r.totals.caps), String(r.totals.labels)];

/** CSV (opens in Excel/Sheets). */
export function packingCsv(r: PackingReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  return [HEAD, ...rowsOf(r), totalRow(r)].map((row) => row.map(q).join(",")).join("\r\n");
}

/** Excel (.xls) — an HTML table served as application/vnd.ms-excel. Matches the
    admin DataTable's existing export convention; no extra dependency. */
export function packingXls(r: PackingReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = HEAD.map((h) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:left">${esc(h)}</th>`).join("");
  const body = rowsOf(r).map((row) => "<tr>" + row.map((c) => `<td style="border:1px solid #ccc;padding:6px 8px">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = "<tr>" + totalRow(r).map((c) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6">${esc(c)}</td>`).join("") + "</tr>";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — Packing List</h3><p>Delivery day ${esc(r.date)} · ${r.stops} stop(s) · generated ${esc(new Date().toLocaleString("en-IN"))}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
