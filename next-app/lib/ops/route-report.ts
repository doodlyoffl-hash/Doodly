/* =============================================================
   DOODLY — Route Optimisation Report (per IST delivery day).
   One row per delivery executive's shift: the optimised round-trip they were
   given (planned distance + est. travel time from the warehouse and back), how
   many stops they ran, and how it landed (completed / missed). "Distance so far"
   is the real distance across the stops already delivered — the future-ready
   foundation for distance-based driver compensation (no pay math here).
   Normalised {columns, rows, totalRow} so it renders through the shared
   milk-report PDF/CSV/XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";

const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export interface RouteReportRow {
  executive: string;
  employeeId: string;
  route: string;
  totalStops: number;
  completed: number;
  missed: number;          // FAILED
  skipped: number;
  plannedKm: number | null;
  plannedMin: number | null;
  distanceSoFarKm: number; // sum of the delivered stops' optimised legs (actual, future-ready)
  source: string;          // ROAD | HAVERSINE | —
}

export interface RouteReport {
  type: string;            // "route" — shapes like MilkReport for the shared renderer
  date: string;
  title: string;
  subtitle: string;
  rowCount: number;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  data: RouteReportRow[];
  totals: { executives: number; stops: number; completed: number; missed: number; plannedKm: number; distanceSoFarKm: number };
}

/** Build the per-executive route report for one IST delivery day (default: today IST). */
export async function routeReport(dateIso?: string | null): Promise<RouteReport> {
  const { start, end, iso } = istDayWindow(dateIso);

  const [deliveries, trips] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, driverId: { not: null } },
      select: {
        driverId: true, status: true, legDistanceKm: true,
        driver: { select: { employeeId: true, user: { select: { name: true } } } },
        route: { select: { code: true, name: true } },
      },
    }),
    db.tripHistory.findMany({
      where: { date: { gte: start, lt: end } },
      select: { driverId: true, plannedDistanceKm: true, plannedDurationMin: true, routeSource: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // latest trip per driver holds the current planned round-trip totals
  const tripByDriver = new Map<string, { plannedKm: number | null; plannedMin: number | null; source: string | null }>();
  for (const t of trips) if (t.driverId && !tripByDriver.has(t.driverId)) tripByDriver.set(t.driverId, { plannedKm: t.plannedDistanceKm, plannedMin: t.plannedDurationMin, source: t.routeSource });

  type Acc = { executive: string; employeeId: string; route: string; total: number; completed: number; missed: number; skipped: number; distanceSoFarKm: number };
  const byDriver = new Map<string, Acc>();
  for (const d of deliveries) {
    if (!d.driverId) continue;
    let a = byDriver.get(d.driverId);
    if (!a) { a = { executive: d.driver?.user?.name ?? "—", employeeId: d.driver?.employeeId ?? "—", route: "", total: 0, completed: 0, missed: 0, skipped: 0, distanceSoFarKm: 0 }; byDriver.set(d.driverId, a); }
    a.total++;
    if (d.status === "DELIVERED") { a.completed++; a.distanceSoFarKm += d.legDistanceKm ?? 0; }
    else if (d.status === "FAILED") a.missed++;
    else if (d.status === "SKIPPED") a.skipped++;
    if (!a.route) { const r = d.route?.code || d.route?.name; if (r) a.route = r; }
  }

  const data: RouteReportRow[] = [...byDriver.entries()].map(([driverId, a]) => {
    const t = tripByDriver.get(driverId);
    return {
      executive: a.executive, employeeId: a.employeeId, route: a.route || "—",
      totalStops: a.total, completed: a.completed, missed: a.missed, skipped: a.skipped,
      plannedKm: t?.plannedKm ?? null, plannedMin: t?.plannedMin ?? null,
      distanceSoFarKm: Math.round(a.distanceSoFarKm * 100) / 100,
      source: t?.source ?? "—",
    };
  }).sort((x, y) => x.executive.localeCompare(y.executive));

  const totals = {
    executives: data.length,
    stops: data.reduce((s, r) => s + r.totalStops, 0),
    completed: data.reduce((s, r) => s + r.completed, 0),
    missed: data.reduce((s, r) => s + r.missed, 0),
    plannedKm: Math.round(data.reduce((s, r) => s + (r.plannedKm ?? 0), 0) * 10) / 10,
    distanceSoFarKm: Math.round(data.reduce((s, r) => s + r.distanceSoFarKm, 0) * 10) / 10,
  };

  const columns = [
    { label: "Executive" }, { label: "Emp ID" }, { label: "Shift / route" },
    { label: "Stops", right: true }, { label: "Completed", right: true }, { label: "Missed", right: true },
    { label: "Planned km (round trip)", right: true }, { label: "Est. travel (min)", right: true },
    { label: "Distance so far (km)", right: true }, { label: "Optimiser" },
  ];
  const rows = data.map((r) => [
    r.executive, r.employeeId, r.route,
    String(r.totalStops), String(r.completed), String(r.missed),
    r.plannedKm != null ? n1(r.plannedKm) : "—", r.plannedMin != null ? String(r.plannedMin) : "—",
    n1(r.distanceSoFarKm), r.source === "ROAD" ? "Road" : r.source === "HAVERSINE" ? "Distance" : "—",
  ]);
  const totalRow = ["TOTAL", "", `${totals.executives} exec(s)`, String(totals.stops), String(totals.completed), String(totals.missed), n1(totals.plannedKm), "", n1(totals.distanceSoFarKm), ""];

  return {
    type: "route", date: iso,
    title: "Delivery Route Report",
    subtitle: `Delivery day ${iso} · ${totals.executives} executive(s) · ${totals.stops} stop(s) · ${n1(totals.plannedKm)} km planned · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: data.length,
    columns, rows, totalRow, data, totals,
  };
}

// ---------- exports ----------
export function routeReportFilename(date: string, ext: string) { return `DOODLY_Route_Report_${date}.${ext}`; }

export function routeReportCsv(r: RouteReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const head = r.columns.map((c) => c.label);
  return [head, ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}

export function routeReportXls(r: RouteReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"};mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
