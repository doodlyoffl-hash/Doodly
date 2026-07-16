/* =============================================================
   DOODLY — Delivery Manifest (per IST delivery day).
   The dispatch sheet: every stop with who it's for, where, what to hand over and
   any special instruction. Grouped by executive (unassigned last), then by slot +
   route sequence — the order the round is actually run in.
   Volume uses the real bottle size (Variant.ml) — never bottles-as-litres.
   ============================================================= */
import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";

const CLOSED: DeliveryStatus[] = ["FAILED", "SKIPPED"];
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

type Addr = {
  houseNo?: string | null; buildingName?: string | null; floor?: string | null; line1?: string | null;
  line2?: string | null; street?: string | null; area?: string | null; city?: string | null;
  state?: string | null; pincode?: string | null; landmark?: string | null; deliveryNote?: string | null;
} | null | undefined;
const ADDR = { select: { houseNo: true, buildingName: true, floor: true, line1: true, line2: true, street: true, area: true, city: true, state: true, pincode: true, landmark: true, deliveryNote: true } } as const;

/* Prefer the structured last-mile fields; fall back to the composed line1/line2 only when
   there are none (line1 is itself composed from house/building, so using both duplicates). */
function fmtAddr(a: Addr): string {
  if (!a) return "—";
  const structured = [a.houseNo, a.buildingName, a.floor, a.street].filter(Boolean);
  const base = structured.length ? structured : [a.line1, a.line2].filter(Boolean);
  const parts = [...base, a.area, a.city, a.state].filter(Boolean);
  return (parts.join(", ") + (a.pincode ? " " + a.pincode : "")) || "—";
}

export interface ManifestRow {
  seq: number;
  deliveryId: string;
  orderRef: string;
  customer: string;
  mobile: string;
  address: string;
  pincode: string;
  landmark: string;
  products: string;
  qty: number;            // product units on this stop
  bottles: number;        // physical bottles to hand over
  litres: number;
  type: string;           // Subscription / One-time / Trial
  plan: string;
  slot: string;
  executive: string;      // "Unassigned" when nobody has it yet
  status: string;
  instructions: string;   // customer remark, else the address's standing delivery note
}
export interface ManifestReport {
  date: string;
  rows: ManifestRow[];
  byExecutive: { executive: string; stops: number; bottles: number }[];
  totals: { stops: number; bottles: number; litres: number; customers: number; unassigned: number };
}

export async function manifestReport(dateIso?: string | null): Promise<ManifestReport> {
  const { start, end, iso } = istDayWindow(dateIso);
  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: CLOSED } },
      orderBy: [{ slot: "asc" }, { sequence: "asc" }, { date: "asc" }],
      take: 5000,
      select: {
        id: true, orderId: true, status: true, slot: true, sequence: true, bottleCount: true, customerRemark: true,
        address: ADDR,
        driver: { select: { employeeId: true, user: { select: { name: true } } } },
        subscription: {
          select: {
            user: { select: { id: true, name: true, phone: true } }, address: ADDR, plan: { select: { name: true } },
            items: { select: { qty: true, variant: { select: { ml: true, label: true, product: { select: { name: true } } } } } },
            order: { select: { id: true } },
          },
        },
        order: { select: { type: true, user: { select: { id: true, name: true, phone: true } }, items: { select: { productName: true, variantLabel: true, productSlug: true } } } },
      },
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);

  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);

  const customers = new Set<string>();
  const out: ManifestRow[] = rows.map((d) => {
    const isSub = !!d.subscription;
    const user = d.subscription?.user ?? d.order?.user ?? null;
    if (user?.id) customers.add(user.id);
    const addr = d.address ?? d.subscription?.address ?? null;
    const oid = d.orderId ?? d.subscription?.order?.id ?? null;

    let products = "—", qty = 0, ml = 0;
    if (isSub) {
      const items = d.subscription?.items ?? [];
      products = items.map((i) => `${i.variant.product?.name ? i.variant.product.name + " " : ""}${i.variant.label} x${i.qty}`.trim()).join(", ") || "—";
      qty = items.reduce((s, i) => s + i.qty, 0);
      ml = items.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0);
    } else {
      const oi = (d.order?.items ?? [])[0];
      qty = d.bottleCount || 1;   // bottles on THIS stop (OrderItem.quantity is days x bottles)
      products = oi ? `${oi.productName}${oi.variantLabel ? " " + oi.variantLabel : ""} x${qty}` : "—";
      ml = (oi ? (mlByKey.get(`${oi.productSlug}|${normLabel(oi.variantLabel)}`) ?? 1000) : 1000) * qty;
    }

    return {
      seq: 0,
      deliveryId: d.id,
      orderRef: oid ? "DOO-" + oid.slice(-6).toUpperCase() : "—",
      customer: user?.name ?? "—",
      mobile: user?.phone ?? "—",
      address: fmtAddr(addr),
      pincode: addr?.pincode ?? "—",
      landmark: addr?.landmark ?? "",
      products,
      qty,
      bottles: d.bottleCount || 0,
      litres: Math.round((ml / 1000) * 100) / 100,
      type: isSub ? "Subscription" : d.order?.type === "SAMPLE" ? "Trial" : "One-time",
      plan: d.subscription?.plan?.name ?? "—",
      slot: d.slot ?? "—",
      executive: d.driver ? `${d.driver.user?.name ?? "—"}${d.driver.employeeId ? " (" + d.driver.employeeId + ")" : ""}` : "Unassigned",
      status: d.status,
      instructions: d.customerRemark || addr?.deliveryNote || "",
    };
  });

  // Group by executive (unassigned last) — a manifest is handed out per round.
  out.sort((a, b) => {
    const au = a.executive === "Unassigned", bu = b.executive === "Unassigned";
    if (au !== bu) return au ? 1 : -1;
    return a.executive.localeCompare(b.executive) || a.slot.localeCompare(b.slot);
  });
  out.forEach((r, i) => { r.seq = i + 1; });

  const grp = new Map<string, { stops: number; bottles: number }>();
  for (const r of out) { const g = grp.get(r.executive) ?? { stops: 0, bottles: 0 }; g.stops++; g.bottles += r.bottles; grp.set(r.executive, g); }

  return {
    date: iso,
    rows: out,
    byExecutive: [...grp.entries()].map(([executive, v]) => ({ executive, ...v })),
    totals: {
      stops: out.length,
      bottles: out.reduce((s, r) => s + r.bottles, 0),
      litres: Math.round(out.reduce((s, r) => s + r.litres, 0) * 100) / 100,
      customers: customers.size,
      unassigned: out.filter((r) => r.executive === "Unassigned").length,
    },
  };
}

// ---------- exports ----------
export function manifestFilename(date: string, ext: string) { return `DOODLY_Delivery_Manifest_${date}.${ext}`; }

const HEAD = ["#", "Order", "Customer", "Mobile", "Address", "Pincode", "Products", "Qty", "Bottles", "Type", "Plan", "Slot", "Executive", "Special instructions"];
const rowsOf = (r: ManifestReport) => r.rows.map((x) => [String(x.seq), x.orderRef, x.customer, x.mobile, x.address, x.pincode, x.products, String(x.qty), String(x.bottles), x.type, x.plan, x.slot, x.executive, x.instructions]);

export function manifestCsv(r: ManifestReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const total = ["", "", `TOTAL: ${r.totals.stops} stop(s)`, "", "", "", "", "", String(r.totals.bottles), "", "", "", "", ""];
  return [HEAD, ...rowsOf(r), total].map((row) => row.map(q).join(",")).join("\r\n");
}

/** Excel (.xls) — HTML table as application/vnd.ms-excel, matching the admin's
    existing DataTable export convention (no extra dependency). */
export function manifestXls(r: ManifestReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = HEAD.map((h) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:left">${esc(h)}</th>`).join("");
  const body = rowsOf(r).map((row) => "<tr>" + row.map((c) => `<td style="border:1px solid #ccc;padding:6px 8px;mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = `<tr><td colspan="8" style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6">TOTAL — ${r.totals.stops} stop(s), ${r.totals.customers} customer(s), ${r.totals.litres} L${r.totals.unassigned ? `, ${r.totals.unassigned} unassigned` : ""}</td><td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6">${r.totals.bottles}</td><td colspan="5" style="border:1px solid #ccc;background:#F6FAF6"></td></tr>`;
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — Delivery Manifest</h3><p>Delivery day ${esc(r.date)} · ${r.totals.stops} stop(s) · generated ${esc(new Date().toLocaleString("en-IN"))}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
