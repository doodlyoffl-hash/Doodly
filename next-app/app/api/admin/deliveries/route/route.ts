/* GET /api/admin/deliveries/route?driverId=&date=YYYY-MM-DD
   One executive's OPTIMISED route for an IST delivery day: the warehouse origin,
   the ordered stops with per-leg + cumulative distance and ETA, and the planned
   round-trip totals. Powers the Delivery-Management "View route" modal.
   RBAC deliveries:view. */
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { istDayWindow } from "@/lib/delivery/stats";
import { getWarehouse } from "@/lib/warehouse/config";
import { optimizeExecutiveRoute } from "@/lib/routes/exec-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR = { select: { houseNo: true, buildingName: true, floor: true, line1: true, line2: true, street: true, area: true, city: true, state: true, pincode: true, landmark: true, lat: true, lng: true, deliveryNote: true } } as const;
type Addr = Prisma.AddressGetPayload<typeof ADDR> | null | undefined;
function fmtAddr(a: Addr): string {
  if (!a) return "—";
  const structured = [a.houseNo, a.buildingName, a.floor, a.street].filter(Boolean);
  const base = structured.length ? structured : [a.line1, a.line2].filter(Boolean);
  const parts = [...base, a.area, a.city, a.state].filter(Boolean);
  return (parts.join(", ") + (a.pincode ? " " + a.pincode : "")) || "—";
}
const r2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);

export const GET = route("admin.deliveries.route", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const sp = new URL(req.url).searchParams;
  const driverId = sp.get("driverId");
  const dateStr = sp.get("date");
  if (!driverId) throw Errors.badRequest("driverId is required.");

  const { start, end, iso } = istDayWindow(dateStr);
  const driver = await db.driver.findUnique({ where: { id: driverId }, select: { id: true, employeeId: true, vehicleNo: true, user: { select: { name: true } } } });
  if (!driver) throw Errors.notFound("Executive not found.");

  // Make sure the sequence + leg metrics are current before we read them (hash-cached no-op when fresh).
  await optimizeExecutiveRoute(driverId, iso).catch(() => {});

  const [wh, rows, trip] = await Promise.all([
    getWarehouse(),
    db.delivery.findMany({
      where: { driverId, date: { gte: start, lt: end } },
      orderBy: [{ sequence: "asc" }, { date: "asc" }],
      select: {
        id: true, status: true, slot: true, sequence: true, bottleCount: true,
        legDistanceKm: true, legTravelMin: true, cumulativeKm: true, etaMinutes: true, distanceKm: true, routeSource: true,
        address: ADDR,
        subscription: { select: { user: { select: { name: true, phone: true } }, address: ADDR, plan: { select: { name: true } }, items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        order: { select: { user: { select: { name: true, phone: true } }, address: ADDR } },
      },
    }),
    db.tripHistory.findFirst({ where: { driverId, date: { gte: start, lt: end } }, orderBy: { createdAt: "desc" }, select: { plannedDistanceKm: true, plannedDurationMin: true, routeSource: true, routePolyline: true } }),
  ]);

  const stops = rows.map((d, i) => {
    const user = d.subscription?.user ?? d.order?.user ?? null;
    const addr = d.address ?? d.subscription?.address ?? d.order?.address ?? null;
    // milk on this stop: subscription items (qty × variant.ml), else bottleCount × 1L default
    const subMl = (d.subscription?.items ?? []).reduce((s, it) => s + (it.variant?.ml ?? 1000) * it.qty, 0);
    const litres = Math.round(((subMl || (d.bottleCount ?? 1) * 1000) / 1000) * 100) / 100;
    return {
      id: d.id, seq: d.sequence ?? i + 1, status: d.status, slot: d.slot ?? null,
      customer: user?.name ?? "—", mobile: user?.phone ?? "—",
      address: fmtAddr(addr), area: addr?.area ?? addr?.city ?? "—", pincode: addr?.pincode ?? null,
      lat: addr?.lat ?? null, lng: addr?.lng ?? null,
      plan: d.subscription?.plan?.name ?? "One-time",
      bottles: d.bottleCount ?? 1, litres,
      legKm: r2(d.legDistanceKm), legMin: d.legTravelMin ?? null,
      cumulativeKm: r2(d.cumulativeKm), etaMinutes: d.etaMinutes ?? null,
      distanceFromWarehouseKm: r2(d.distanceKm), routeSource: d.routeSource ?? null,
    };
  });

  const done = stops.filter((s) => s.status === "DELIVERED");
  const completed = done.length;
  // Live progress: distance/time already travelled = the completed stops' optimised legs.
  const travelledKm = Math.round(done.reduce((a, s) => a + (s.legKm ?? 0), 0) * 100) / 100;
  const travelledMin = done.reduce((a, s) => a + (s.legMin ?? 0), 0);
  const plannedKm = trip?.plannedDistanceKm ?? null, plannedMin = trip?.plannedDurationMin ?? null;
  const totalBottles = stops.reduce((a, s) => a + (s.bottles ?? 0), 0);
  const totalMilkLitres = Math.round(stops.reduce((a, s) => a + (s.litres ?? 0), 0) * 100) / 100;
  return ok({
    driver: { id: driver.id, name: driver.user?.name ?? "Executive", employeeId: driver.employeeId, vehicleNo: driver.vehicleNo },
    date: iso,
    warehouse: { name: wh.name, lat: wh.lat, lng: wh.lng },
    route: {
      plannedKm: r2(plannedKm), plannedMin: plannedMin,
      source: trip?.routeSource ?? stops.find((s) => s.routeSource)?.routeSource ?? null,
      polyline: trip?.routePolyline ?? null,   // road geometry for the map (ROAD only)
      totalStops: stops.length, completedStops: completed, remainingStops: stops.length - completed,
      travelledKm, remainingKm: plannedKm != null ? r2(Math.max(0, plannedKm - travelledKm)) : null,
      travelledMin, remainingMin: plannedMin != null ? Math.max(0, plannedMin - travelledMin) : null,
      totalBottles, totalMilkLitres,
    },
    stops,
  });
});
