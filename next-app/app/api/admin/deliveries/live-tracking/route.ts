/* GET /api/admin/deliveries/live-tracking?date=YYYY-MM-DD
   Live operations view: every delivery executive currently ON SHIFT, with their
   last known GPS position, the distance their device has actually recorded so far
   (fraud-filtered), when GPS last updated, and route progress (delivered / total)
   for the day. Read-only; reuses Driver.lat/lng/lastSeenAt + the open Shift.
   RBAC deliveries:view. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { getDriverPayConfig } from "@/lib/delivery/pay-config";
import { estimateDriverPay, payRateBasis } from "@/lib/delivery/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const RESOLVED = new Set(["DELIVERED", "PARTIALLY_DELIVERED", "FAILED", "SKIPPED"]);

export async function GET(req: NextRequest) {
  try { requirePermission(req, "deliveries", "view"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { start, end, iso } = istDayWindow(req.nextUrl.searchParams.get("date"));
  const payCfg = await getDriverPayConfig();

  const shifts = await db.shift.findMany({
    where: { status: "OPEN" },
    orderBy: { startedAt: "asc" },
    select: {
      id: true, driverId: true, startedAt: true, actualDistanceKm: true, plannedDistanceKm: true, gpsPointCount: true,
      driver: { select: { id: true, employeeId: true, lat: true, lng: true, lastSeenAt: true, user: { select: { name: true } } } },
    },
  });

  const driverIds = shifts.map((s) => s.driverId).filter(Boolean) as string[];
  // per-driver delivery progress for the selected day
  const progress = new Map<string, { total: number; done: number }>();
  if (driverIds.length) {
    const dels = await db.delivery.findMany({
      where: { driverId: { in: driverIds }, date: { gte: start, lt: end } },
      select: { driverId: true, status: true },
    });
    for (const d of dels) {
      if (!d.driverId) continue;
      const p = progress.get(d.driverId) ?? { total: 0, done: 0 };
      p.total++; if (RESOLVED.has(d.status)) p.done++;
      progress.set(d.driverId, p);
    }
  }

  const now = Date.now();
  const execs = shifts.map((s) => {
    const dv = s.driver;
    const p = (s.driverId && progress.get(s.driverId)) || { total: 0, done: 0 };
    const planned = s.plannedDistanceKm != null ? round1(s.plannedDistanceKm) : null;
    const actual = round2(s.actualDistanceKm ?? 0);
    const lastSeen = dv?.lastSeenAt ? new Date(dv.lastSeenAt).getTime() : null;
    const pay = estimateDriverPay({ actualKm: actual, deliveries: p.done }, payCfg);
    return {
      driverId: s.driverId,
      name: dv?.user?.name ?? "—",
      employeeId: dv?.employeeId ?? "—",
      startedAt: s.startedAt,
      lat: dv?.lat ?? null,
      lng: dv?.lng ?? null,
      lastSeenAt: dv?.lastSeenAt ?? null,
      gpsAgeSec: lastSeen != null ? Math.max(0, Math.round((now - lastSeen) / 1000)) : null,
      gpsPointCount: s.gpsPointCount ?? 0,
      hasFix: dv?.lat != null && dv?.lng != null,
      actualDistanceKm: actual,
      plannedKm: planned,
      efficiencyPct: planned != null && actual > 0 ? Math.round((planned / actual) * 100) : null,
      deliveries: { total: p.total, done: p.done, pending: Math.max(0, p.total - p.done) },
      payEstimate: pay.enabled ? pay.total : null,
    };
  });

  const totals = {
    onShift: execs.length,
    withFix: execs.filter((e) => e.hasFix).length,
    actualKm: round1(execs.reduce((a, e) => a + e.actualDistanceKm, 0)),
    deliveriesDone: execs.reduce((a, e) => a + e.deliveries.done, 0),
    deliveriesTotal: execs.reduce((a, e) => a + e.deliveries.total, 0),
    payEstimate: payCfg.enabled ? round2(execs.reduce((a, e) => a + (e.payEstimate ?? 0), 0)) : null,
  };

  const pay = { enabled: payCfg.enabled, basis: payRateBasis(payCfg) };
  return NextResponse.json({ date: iso, execs, totals, pay }, { headers: { "Cache-Control": "no-store" } });
}
