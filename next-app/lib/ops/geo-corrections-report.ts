/* =============================================================
   DOODLY — GPS Corrections report. Three lenses over the append-only
   GeoCorrection history: per-customer (who was corrected + how far the pin
   moved), per-executive (collection performance), and per-area (frequently
   corrected PIN codes). Normalised {columns, rows, totalRow} so it renders
   through the shared milk-report PDF/CSV/XLS pipeline. Read-only.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export type GeoReportKind = "customers" | "executives" | "areas";
const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const coord = (lat: number | null | undefined, lng: number | null | undefined) =>
  lat != null && lng != null ? `${(Math.round(lat * 1e5) / 1e5)}, ${(Math.round(lng * 1e5) / 1e5)}` : "—";

export interface GeoReport {
  type: string;
  kind: GeoReportKind;
  title: string;
  subtitle: string;
  rowCount: number;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  data: unknown;
  totals: { corrections: number };
}

export async function geoCorrectionsReport(kind: GeoReportKind, opts: { from?: string | null; to?: string | null } = {}): Promise<GeoReport> {
  const where: Record<string, unknown> = {};
  if (opts.from || opts.to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) createdAt.gte = new Date(opts.from + "T00:00:00.000Z");
    if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) createdAt.lte = new Date(opts.to + "T23:59:59.999Z");
    where.createdAt = createdAt;
  }

  const recs = await db.geoCorrection.findMany({
    where, orderBy: { createdAt: "asc" },
    select: {
      addressId: true, createdAt: true, source: true, correctedById: true, correctedByRole: true, execEmployeeId: true,
      oldLat: true, oldLng: true, newLat: true, newLng: true, distanceMovedKm: true, declaredPincode: true,
      address: { select: { label: true, line1: true, city: true, pincode: true, lat: true, lng: true } },
      user: { select: { id: true, name: true } },
    },
  });

  const genAt = new Date().toLocaleString("en-IN");
  const range = opts.from || opts.to ? `${opts.from ?? "…"} → ${opts.to ?? "…"}` : "all time";
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // ---------- per-customer (grouped by address) ----------
  if (kind === "customers") {
    const byAddr = new Map<string, typeof recs>();
    for (const r of recs) { const a = byAddr.get(r.addressId) ?? []; a.push(r); byAddr.set(r.addressId, a); }
    const data = [...byAddr.values()].map((list) => {
      const first = list[0], last = list[list.length - 1];
      const moves = list.map((x) => x.distanceMovedKm).filter((v): v is number => v != null);
      return {
        customer: first.user?.name ?? "Customer",
        address: [first.address?.line1, first.address?.city, first.address?.pincode].filter(Boolean).join(", "),
        original: coord(first.oldLat ?? first.newLat, first.oldLng ?? first.newLng),
        latest: coord(last.address?.lat ?? last.newLat, last.address?.lng ?? last.newLng),
        corrections: list.length,
        avgMoveKm: avg(moves),
        lastAt: last.createdAt,
        by: last.source === "ADMIN" ? "Back office" : "Field exec",
      };
    }).sort((a, b) => b.corrections - a.corrections || a.customer.localeCompare(b.customer));
    const columns = [
      { label: "Customer" }, { label: "Address" }, { label: "Original (lat, lng)" }, { label: "Latest (lat, lng)" },
      { label: "Corrections", right: true }, { label: "Avg move (km)", right: true }, { label: "Last corrected" }, { label: "By" },
    ];
    const rows = data.map((r) => [r.customer, r.address, r.original, r.latest, String(r.corrections), n2(r.avgMoveKm), r.lastAt.toLocaleString("en-IN"), r.by]);
    const totalRow = ["TOTAL", `${data.length} customer(s)`, "", "", String(recs.length), "", "", ""];
    return {
      type: "geo", kind, title: "GPS Corrections — Customers",
      subtitle: `${data.length} customer(s) · ${recs.length} correction(s) · ${range} · generated ${genAt}`,
      rowCount: data.length, columns, rows, totalRow, data, totals: { corrections: recs.length },
    };
  }

  // ---------- per-executive ----------
  if (kind === "executives") {
    const actorIds = [...new Set(recs.map((r) => r.correctedById).filter(Boolean) as string[])];
    const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));
    const byActor = new Map<string, typeof recs>();
    for (const r of recs) { const k = r.correctedById ?? "system"; const a = byActor.get(k) ?? []; a.push(r); byActor.set(k, a); }
    const data = [...byActor.entries()].map(([id, list]) => {
      const moves = list.map((x) => x.distanceMovedKm).filter((v): v is number => v != null);
      return {
        executive: id === "system" ? "System" : (nameOf.get(id) ?? "Staff"),
        employeeId: list.find((x) => x.execEmployeeId)?.execEmployeeId ?? "—",
        role: list[0].correctedByRole ?? "—",
        corrections: list.length,
        avgMoveKm: avg(moves),
        lastAt: list[list.length - 1].createdAt,
      };
    }).sort((a, b) => b.corrections - a.corrections);
    const columns = [
      { label: "Executive / actor" }, { label: "Emp ID" }, { label: "Role" },
      { label: "Corrections", right: true }, { label: "Avg move (km)", right: true }, { label: "Last correction" },
    ];
    const rows = data.map((r) => [r.executive, r.employeeId, r.role, String(r.corrections), n2(r.avgMoveKm), r.lastAt.toLocaleString("en-IN")]);
    const totalRow = ["TOTAL", `${data.length} actor(s)`, "", String(recs.length), "", ""];
    return {
      type: "geo", kind, title: "GPS Corrections — Executives",
      subtitle: `${data.length} actor(s) · ${recs.length} correction(s) · ${range} · generated ${genAt}`,
      rowCount: data.length, columns, rows, totalRow, data, totals: { corrections: recs.length },
    };
  }

  // ---------- per-area (PIN code) ----------
  const byPin = new Map<string, typeof recs>();
  for (const r of recs) { const k = r.declaredPincode || r.address?.pincode || "—"; const a = byPin.get(k) ?? []; a.push(r); byPin.set(k, a); }
  const data = [...byPin.entries()].map(([pincode, list]) => {
    const moves = list.map((x) => x.distanceMovedKm).filter((v): v is number => v != null);
    return {
      pincode,
      corrections: list.length,
      customers: new Set(list.map((x) => x.addressId)).size,
      avgMoveKm: avg(moves),
    };
  }).sort((a, b) => b.corrections - a.corrections);
  const columns = [
    { label: "PIN code" }, { label: "Corrections", right: true }, { label: "Addresses", right: true }, { label: "Avg move (km)", right: true },
  ];
  const rows = data.map((r) => [r.pincode, String(r.corrections), String(r.customers), n2(r.avgMoveKm)]);
  const totalRow = ["TOTAL", String(recs.length), String(data.length) + " area(s)", ""];
  return {
    type: "geo", kind: "areas", title: "GPS Corrections — Areas",
    subtitle: `${data.length} area(s) · ${recs.length} correction(s) · ${range} · generated ${genAt}`,
    rowCount: data.length, columns, rows, totalRow, data, totals: { corrections: recs.length },
  };
}

// ---------- exports (mirror route-report) ----------
export function geoReportFilename(kind: string, ext: string) {
  return `DOODLY_GPS_Corrections_${kind}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}
export function geoReportCsv(r: GeoReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  return [r.columns.map((c) => c.label), ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}
export function geoReportXls(r: GeoReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"};mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body><h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p><table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
