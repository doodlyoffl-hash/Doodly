/* =============================================================
   DOODLY — GPS Travel-Distance Report (per IST delivery day).
   One row per delivery executive: the ACTUAL kilometres their device recorded
   during the day's shift(s) (server-computed, fraud-filtered) versus the planned
   optimised round-trip, plus deliveries, average km per delivery, average shift
   speed and hours worked. The reliable, future-ready basis for distance-based
   pay / fuel / incentives (no pay math here). Normalised {columns, rows, totalRow}
   so it renders through the shared milk-report PDF/CSV/XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";

const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GpsDistanceRow {
  executive: string;
  employeeId: string;
  status: string;            // "Live" (a shift still open) | "Closed"
  shifts: number;
  actualKm: number;          // GPS-measured travelled distance (fraud-filtered)
  plannedKm: number | null;  // optimised round-trip (planned-vs-actual)
  differenceKm: number | null; // actual − planned
  deliveries: number;
  avgKmPerDelivery: number | null;
  avgSpeedKmh: number | null;  // actual km ÷ hours worked (whole-shift average)
  workingHours: number;
  gpsPoints: number;
}

export interface GpsDistanceReport {
  type: string;              // "gps" — shaped like MilkReport for the shared renderer
  date: string;
  title: string;
  subtitle: string;
  rowCount: number;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  data: GpsDistanceRow[];
  totals: { executives: number; actualKm: number; plannedKm: number; deliveries: number; hours: number };
}

/** Build the per-executive GPS travel-distance report for one IST delivery day (default: today IST). */
export async function gpsDistanceReport(dateIso?: string | null): Promise<GpsDistanceReport> {
  const { start, end, iso } = istDayWindow(dateIso);
  const now = new Date();

  // Every shift that STARTED within the day window (open shifts show distance so far).
  const shifts = await db.shift.findMany({
    where: { startedAt: { gte: start, lt: end } },
    select: {
      driverId: true, status: true, startedAt: true, endedAt: true, workedMinutes: true,
      actualDistanceKm: true, plannedDistanceKm: true, deliveriesCount: true, gpsPointCount: true,
      driver: { select: { employeeId: true, user: { select: { name: true } } } },
    },
    orderBy: { startedAt: "asc" },
  });

  type Acc = { executive: string; employeeId: string; open: boolean; shifts: number; actualKm: number; plannedKm: number; hasPlanned: boolean; deliveries: number; workedMin: number; gpsPoints: number };
  const byDriver = new Map<string, Acc>();
  for (const s of shifts) {
    if (!s.driverId) continue;
    let a = byDriver.get(s.driverId);
    if (!a) { a = { executive: s.driver?.user?.name ?? "—", employeeId: s.driver?.employeeId ?? "—", open: false, shifts: 0, actualKm: 0, plannedKm: 0, hasPlanned: false, deliveries: 0, workedMin: 0, gpsPoints: 0 }; byDriver.set(s.driverId, a); }
    a.shifts++;
    a.actualKm += s.actualDistanceKm ?? 0;
    if (s.plannedDistanceKm != null) { a.plannedKm += s.plannedDistanceKm; a.hasPlanned = true; }
    a.deliveries += s.deliveriesCount ?? 0;
    a.gpsPoints += s.gpsPointCount ?? 0;
    // worked minutes: the stamped value once closed, else elapsed-so-far for a live shift
    const mins = s.workedMinutes ?? Math.max(0, Math.round(((s.endedAt ?? now).getTime() - s.startedAt.getTime()) / 60000));
    a.workedMin += mins;
    if (s.status === "OPEN") a.open = true;
  }

  const data: GpsDistanceRow[] = [...byDriver.values()].map((a) => {
    const actualKm = round2(a.actualKm);
    const plannedKm = a.hasPlanned ? round1(a.plannedKm) : null;
    const hours = a.workedMin / 60;
    return {
      executive: a.executive, employeeId: a.employeeId,
      status: a.open ? "Live" : "Closed", shifts: a.shifts,
      actualKm,
      plannedKm,
      differenceKm: plannedKm != null ? round1(actualKm - plannedKm) : null,
      deliveries: a.deliveries,
      avgKmPerDelivery: a.deliveries > 0 ? round2(actualKm / a.deliveries) : null,
      avgSpeedKmh: hours > 0 ? round1(actualKm / hours) : null,
      workingHours: round1(hours),
      gpsPoints: a.gpsPoints,
    };
  }).sort((x, y) => x.executive.localeCompare(y.executive));

  const totals = {
    executives: data.length,
    actualKm: round1(data.reduce((s, r) => s + r.actualKm, 0)),
    plannedKm: round1(data.reduce((s, r) => s + (r.plannedKm ?? 0), 0)),
    deliveries: data.reduce((s, r) => s + r.deliveries, 0),
    hours: round1(data.reduce((s, r) => s + r.workingHours, 0)),
  };
  const totalDiff = round1(totals.actualKm - totals.plannedKm);
  const totalAvgPerDel = totals.deliveries > 0 ? round2(totals.actualKm / totals.deliveries) : null;
  const totalAvgSpeed = totals.hours > 0 ? round1(totals.actualKm / totals.hours) : null;

  const columns = [
    { label: "Executive" }, { label: "Emp ID" }, { label: "Status" },
    { label: "Actual km (GPS)", right: true }, { label: "Planned km", right: true }, { label: "Difference (km)", right: true },
    { label: "Deliveries", right: true }, { label: "Avg km / delivery", right: true }, { label: "Avg speed (km/h)", right: true },
    { label: "Hours worked", right: true }, { label: "GPS points", right: true },
  ];
  const rows = data.map((r) => [
    r.executive, r.employeeId, r.status,
    n1(r.actualKm), r.plannedKm != null ? n1(r.plannedKm) : "—", r.differenceKm != null ? (r.differenceKm > 0 ? "+" : "") + n1(r.differenceKm) : "—",
    String(r.deliveries), r.avgKmPerDelivery != null ? n1(r.avgKmPerDelivery) : "—", r.avgSpeedKmh != null ? n1(r.avgSpeedKmh) : "—",
    n1(r.workingHours), String(r.gpsPoints),
  ]);
  const totalRow = [
    "TOTAL", "", `${totals.executives} exec(s)`,
    n1(totals.actualKm), n1(totals.plannedKm), (totalDiff > 0 ? "+" : "") + n1(totalDiff),
    String(totals.deliveries), totalAvgPerDel != null ? n1(totalAvgPerDel) : "—", totalAvgSpeed != null ? n1(totalAvgSpeed) : "—",
    n1(totals.hours), "",
  ];

  return {
    type: "gps", date: iso,
    title: "GPS Travel-Distance Report",
    subtitle: `Delivery day ${iso} · ${totals.executives} executive(s) · ${n1(totals.actualKm)} km actual vs ${n1(totals.plannedKm)} km planned · ${totals.deliveries} deliveries · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: data.length,
    columns, rows, totalRow, data, totals,
  };
}

// ---------- exports ----------
export function gpsDistanceReportFilename(date: string, ext: string) { return `DOODLY_GPS_Distance_Report_${date}.${ext}`; }

export function gpsDistanceReportCsv(r: GpsDistanceReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const head = r.columns.map((c) => c.label);
  return [head, ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}

export function gpsDistanceReportXls(r: GpsDistanceReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"};mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
