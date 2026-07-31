/* =============================================================
   DOODLY — Monthly driver-pay SUMMARY (per IST calendar month).
   Rolls the daily GPS-distance pay estimate up to a month: one row per delivery
   executive with days worked, total GPS km, deliveries, hours, and the estimated
   pay (base × worked DAYS + fuel × km + per-delivery × deliveries, each day
   floored at the shift minimum). Multiple shifts in one day count as ONE worked
   day, so the daily wage is never multiplied. An ESTIMATE — it moves no money,
   and it EXCLUDES any discretionary monthly bonus (that stays manual in payroll).
   Normalised {columns,rows,totalRow} → the shared PDF/CSV/XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istISO } from "@/lib/delivery/stats";
import { getDriverPayConfig } from "@/lib/delivery/pay-config";
import { estimateDriverPay, payRateBasis } from "@/lib/delivery/pay";

const IST_MS = 5.5 * 60 * 60 * 1000;
const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** [start, end) for one IST calendar month; iso = "YYYY-MM" (default current IST month). */
export function istMonthWindow(monthStr?: string | null): { start: Date; end: Date; iso: string; label: string } {
  const nowIst = new Date(Date.now() + IST_MS);
  let y = nowIst.getUTCFullYear(), m = nowIst.getUTCMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) { y = Number(monthStr.slice(0, 4)); m = Number(monthStr.slice(5, 7)) - 1; }
  const start = new Date(Date.UTC(y, m, 1) - IST_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_MS);
  const iso = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = new Date(Date.UTC(y, m, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start, end, iso, label };
}

export interface MonthlyPayRow {
  executive: string;
  employeeId: string;
  daysWorked: number;
  shifts: number;
  totalKm: number;
  deliveries: number;
  hours: number;
  basePay: number;      // baseShiftPay × days worked
  fuelPay: number;      // fuelPerKm × total km
  deliveryPay: number;  // perDeliveryRate × deliveries
  estPay: number;       // Σ per-DAY floored estimate (the payable figure, excl. bonus)
}

export interface MonthlyPayReport {
  type: string;
  date: string;         // "YYYY-MM"
  title: string;
  subtitle: string;
  rowCount: number;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  data: MonthlyPayRow[];
  totals: { executives: number; daysWorked: number; totalKm: number; deliveries: number; hours: number; estPay: number };
  payEnabled: boolean;
}

export async function monthlyPayReport(monthStr?: string | null): Promise<MonthlyPayReport> {
  const { start, end, iso, label } = istMonthWindow(monthStr);
  const cfg = await getDriverPayConfig();

  const shifts = await db.shift.findMany({
    where: { startedAt: { gte: start, lt: end } },
    select: {
      driverId: true, startedAt: true, endedAt: true, workedMinutes: true,
      actualDistanceKm: true, deliveriesCount: true,
      driver: { select: { employeeId: true, user: { select: { name: true } } } },
    },
    orderBy: { startedAt: "asc" },
  });

  // group shifts → driver → IST day (so the daily wage is counted once per worked day)
  type Day = { km: number; deliveries: number; minutes: number };
  type Acc = { executive: string; employeeId: string; shifts: number; days: Map<string, Day> };
  const now = new Date();
  const byDriver = new Map<string, Acc>();
  for (const s of shifts) {
    if (!s.driverId) continue;
    let a = byDriver.get(s.driverId);
    if (!a) { a = { executive: s.driver?.user?.name ?? "—", employeeId: s.driver?.employeeId ?? "—", shifts: 0, days: new Map() }; byDriver.set(s.driverId, a); }
    a.shifts++;
    const key = istISO(s.startedAt);
    const day = a.days.get(key) ?? { km: 0, deliveries: 0, minutes: 0 };
    day.km += s.actualDistanceKm ?? 0;
    day.deliveries += s.deliveriesCount ?? 0;
    day.minutes += s.workedMinutes ?? Math.max(0, Math.round(((s.endedAt ?? now).getTime() - s.startedAt.getTime()) / 60000));
    a.days.set(key, day);
  }

  const data: MonthlyPayRow[] = [...byDriver.values()].map((a) => {
    let totalKm = 0, deliveries = 0, minutes = 0, estPay = 0;
    for (const d of a.days.values()) {
      totalKm += d.km; deliveries += d.deliveries; minutes += d.minutes;
      estPay += estimateDriverPay({ actualKm: d.km, deliveries: d.deliveries }, cfg).total;   // base counted ONCE per day, floored per day
    }
    const daysWorked = a.days.size;
    return {
      executive: a.executive, employeeId: a.employeeId,
      daysWorked, shifts: a.shifts,
      totalKm: round2(totalKm), deliveries, hours: round1(minutes / 60),
      basePay: round2(cfg.baseShiftPay * daysWorked),
      fuelPay: round2(cfg.fuelPerKm * totalKm),
      deliveryPay: round2(cfg.perDeliveryRate * deliveries),
      estPay: round2(estPay),
    };
  }).sort((x, y) => y.estPay - x.estPay || x.executive.localeCompare(y.executive));

  const payOn = cfg.enabled;
  const totals = {
    executives: data.length,
    daysWorked: data.reduce((s, r) => s + r.daysWorked, 0),
    totalKm: round1(data.reduce((s, r) => s + r.totalKm, 0)),
    deliveries: data.reduce((s, r) => s + r.deliveries, 0),
    hours: round1(data.reduce((s, r) => s + r.hours, 0)),
    estPay: round2(data.reduce((s, r) => s + r.estPay, 0)),
  };

  const columns = [
    { label: "Executive" }, { label: "Emp ID" },
    { label: "Days", right: true }, { label: "Total km", right: true }, { label: "Deliveries", right: true }, { label: "Hours", right: true },
    { label: "Base", right: true }, { label: "Fuel", right: true }, { label: "Per-delivery", right: true }, { label: "Est. pay", right: true },
  ];
  const rows = data.map((r) => [
    r.executive, r.employeeId,
    String(r.daysWorked), n1(r.totalKm), String(r.deliveries), n1(r.hours),
    money(r.basePay), money(r.fuelPay), money(r.deliveryPay), money(r.estPay),
  ]);
  const totalRow = [
    "TOTAL", `${totals.executives} exec(s)`,
    String(totals.daysWorked), n1(totals.totalKm), String(totals.deliveries), n1(totals.hours),
    money(round2(data.reduce((s, r) => s + r.basePay, 0))), money(round2(data.reduce((s, r) => s + r.fuelPay, 0))), money(round2(data.reduce((s, r) => s + r.deliveryPay, 0))), money(totals.estPay),
  ];

  return {
    type: "monthlyPay", date: iso,
    title: "Monthly Driver-Pay Summary",
    subtitle: `${label} · ${totals.executives} executive(s) · ${totals.daysWorked} day(s) worked · ${n1(totals.totalKm)} km · est. pay ${money(totals.estPay)}${payOn ? ` (${payRateBasis(cfg)})` : " (estimate off)"} · excludes discretionary monthly bonus · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: data.length,
    columns, rows, totalRow, data, totals, payEnabled: payOn,
  };
}

// ---------- exports ----------
export function monthlyPayReportFilename(date: string, ext: string) { return `DOODLY_Monthly_Pay_${date}.${ext}`; }

export function monthlyPayReportCsv(r: MonthlyPayReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const head = r.columns.map((c) => c.label);
  return [head, ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}

export function monthlyPayReportXls(r: MonthlyPayReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"};mso-number-format:'\\@'">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
