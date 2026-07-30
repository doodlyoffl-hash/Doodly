/* GET /api/delivery/my-route — the signed-in delivery executive's own route.
   Scoped hard: role must be delivery_executive (or super_admin testing), and
   only deliveries assigned to THEIR Driver record are returned. Defaults to
   today; when today has no assignments it falls back to the most recent day
   that does, so the portal always shows the executive's real work. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { getWarehouse } from "@/lib/warehouse/config";
import { optimizeExecutiveRoute } from "@/lib/routes/exec-route";
import { istDayWindow } from "@/lib/delivery/stats";
import { heldByUsers } from "@/lib/bottles/balance";
import { getGeoCorrectionConfig } from "@/lib/geo/correction-config";

const IST_MS = 5.5 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "assigned", ASSIGNED: "assigned", ACCEPTED: "assigned", PACKED: "assigned",
  OUT_FOR_DELIVERY: "onway", ON_THE_WAY: "onway", REACHED: "reached",
  DELIVERED: "delivered", FAILED: "assigned", SKIPPED: "delivered",
};

export const GET = route("delivery.myRoute", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = readRole(req);
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");

  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, include: { user: { select: { name: true } } } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const sp = new URL(req.url).searchParams;
  const dateParam = sp.get("date");
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) throw Errors.badRequest("Invalid date.");
  // Deliveries are stamped at IST midnight → resolve the day in IST (matches the optimiser
  // and the rest of the date-based ops boards). Server-local windows drift by 5.5h on Vercel.
  let win = istDayWindow(dateParam);
  let dayStart = win.start, dayEnd = win.end;

  const include = {
    address: true,   // the delivery's own pinned address snapshot — the authoritative stop location
    subscription: { include: { user: { select: { id: true, name: true, phone: true } }, address: true, items: { include: { variant: { select: { label: true, product: { select: { name: true } } } } } }, plan: { select: { name: true } } } },
    order: { include: { user: { select: { id: true, name: true, phone: true } }, address: true, payment: { select: { method: true, status: true } } } },
    route: { select: { id: true, name: true, code: true } },
  } as const;

  let rows = await db.delivery.findMany({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, orderBy: [{ sequence: "asc" }, { date: "asc" }], include });

  // fallback: latest day that has assignments (keeps the portal demonstrable with seeded data)
  let fellBack = false;
  if (!rows.length && !dateParam) {
    const latest = await db.delivery.findFirst({ where: { driverId: driver.id }, orderBy: { date: "desc" }, select: { date: true } });
    if (latest) {
      win = istDayWindow(new Date(latest.date.getTime() + IST_MS).toISOString().slice(0, 10));
      dayStart = win.start; dayEnd = win.end;
      rows = await db.delivery.findMany({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, orderBy: [{ sequence: "asc" }, { date: "asc" }], include });
      fellBack = true;
    }
  }

  // Ensure the route is optimised & sequenced for this day (hash-cached → a fast no-op when
  // already fresh; also recovers if the post-assign optimise ever failed). Best-effort; on any
  // change re-read so the executive sees the up-to-date sequence + leg metrics.
  if (rows.length) {
    try {
      const res = await optimizeExecutiveRoute(driver.id, win.iso);
      if (res && !res.skipped) rows = await db.delivery.findMany({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, orderBy: [{ sequence: "asc" }, { date: "asc" }], include });
    } catch { /* keep the rows we have */ }
  }

  // Rolled-forward empties each customer still holds (the spec's "expected" to collect),
  // batched over every stop's customer so there's no N+1.
  const held = await heldByUsers(rows.map((d) => d.subscription?.user?.id ?? d.order?.user?.id).filter(Boolean) as string[]);

  // Geo-correction eligibility: the feature is on, and the executive is on-shift.
  // Per-stop we additionally require the stop to still be active (not delivered/failed/skipped).
  const geoCfg = await getGeoCorrectionConfig();
  const execStatus = await db.executiveStatus.findUnique({ where: { driverId: driver.id }, select: { availability: true } }).catch(() => null);
  const onShift = !execStatus || execStatus.availability !== "OFFLINE";
  const canCorrectBase = geoCfg.enabled && (!geoCfg.requireShift || onShift);

  const stops = rows.map((d, i) => {
    const cust = d.subscription?.user ?? d.order?.user ?? null;
    // authoritative stop location: the delivery's own snapshot, else the subscription's,
    // else the one-time order's address (one-time orders have no subscription).
    const addr = d.address ?? d.subscription?.address ?? d.order?.address ?? null;
    const item = d.subscription?.items?.[0];
    const cod = d.order && d.order.status === "PENDING" && d.order.payment?.method === "CASH";
    return {
      id: d.id, seq: d.sequence ?? i + 1,
      // the person to meet at the door = the address's delivery contact if set, else the account holder
      name: addr?.contactName || cust?.name || "Customer",
      mobile: addr?.contactPhone || cust?.phone || "",
      customerName: cust?.name ?? "Customer",
      altPhone: addr?.altPhone ?? null,
      label: addr?.label ?? "Home",
      address: addr ? [addr.line1, addr.line2, `${addr.city} ${addr.pincode}`].filter(Boolean).join(", ") : "Address on file",
      // structured last-mile fields — so the executive can find the exact door without calling
      houseNo: addr?.houseNo ?? null, buildingName: addr?.buildingName ?? null, floor: addr?.floor ?? null,
      street: addr?.street ?? null, landmark: addr?.landmark ?? null,
      block: addr?.block ?? null, wing: addr?.wing ?? null, gateNumber: addr?.gateNumber ?? null, doorColor: addr?.doorColor ?? null,
      area: addr?.area || addr?.city || "", city: addr?.city ?? "", state: addr?.state ?? "", pincode: addr?.pincode ?? "",
      lat: addr?.lat ?? null, lng: addr?.lng ?? null,
      plan: d.subscription?.plan?.name ?? (d.order ? "One-time order" : "Delivery"),
      qty: item?.qty ?? 1,
      itemLabel: item ? `${item.variant.label} ${item.variant.product.name}` : "",
      instructions: addr?.deliveryNote ?? "",
      bottlesExpected: d.bottleCount ?? 1,          // milk bottles to HAND OVER today
      bottlesCollected: d.bottlesIn ?? 0,           // empties collected today
      bottlesOutstanding: cust?.id ? (held.get(cust.id) ?? 0) : 0,   // empties the customer still holds (EXPECTED to collect)
      payment: cod && d.order ? `COD ₹${Math.round(d.order.totalPaise / 100)}` : "Paid",
      status: STATUS_MAP[d.status] ?? "assigned",
      slot: d.slot, deliveredAt: d.deliveredAt,
      // route-optimisation metrics (warehouse-anchored, populated by the optimiser)
      legKm: d.legDistanceKm != null ? round2(d.legDistanceKm) : null,   // from the previous stop (warehouse → first)
      legMin: d.legTravelMin ?? null,
      cumulativeKm: d.cumulativeKm != null ? round2(d.cumulativeKm) : null,   // running distance from the warehouse
      etaMinutes: d.etaMinutes ?? null,                                        // minutes after leaving the warehouse
      distanceFromWarehouseKm: d.distanceKm != null ? round2(d.distanceKm) : null,
      routeSource: d.routeSource ?? null,
      // ---- geo-location verification (Step 2) ----
      verified: addr?.verified ?? false,                 // pin present + agrees with pincode + serviceable
      hasPin: addr?.lat != null && addr?.lng != null,    // whether any pin is dropped
      canCorrectGeo: canCorrectBase && d.status !== "DELIVERED" && d.status !== "FAILED" && d.status !== "SKIPPED",
    };
  });

  // ---- Live route summary (Step 4): warehouse origin + planned/travelled/remaining ----
  const wh = await getWarehouse();
  const trip = await db.tripHistory.findFirst({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, select: { plannedDistanceKm: true, plannedDurationMin: true, routeSource: true, routePolyline: true } });
  const done = stops.filter((s) => s.status === "delivered");
  const travelledKm = round2(done.reduce((a, s) => a + (s.legKm ?? 0), 0));
  const travelledMin = done.reduce((a, s) => a + (s.legMin ?? 0), 0);
  const source = trip?.routeSource ?? stops.find((s) => s.routeSource)?.routeSource ?? null;
  const routeSummary = {
    name: rows[0]?.route?.name ?? null,
    code: rows[0]?.route?.code ?? null,
    warehouse: { name: wh.name, lat: wh.lat, lng: wh.lng },
    source,
    polyline: trip?.routePolyline ?? null,   // road geometry for the map (ROAD only)
    plannedKm: trip?.plannedDistanceKm != null ? round2(trip.plannedDistanceKm) : null,
    plannedMin: trip?.plannedDurationMin ?? null,
    totalStops: stops.length,
    completedStops: done.length,
    remainingStops: stops.length - done.length,
    travelledKm,
    travelledMin,
    remainingKm: trip?.plannedDistanceKm != null ? round2(Math.max(0, trip.plannedDistanceKm - travelledKm)) : null,
    remainingMin: trip?.plannedDurationMin != null ? Math.max(0, trip.plannedDurationMin - travelledMin) : null,
    // empties still to collect across the not-yet-delivered stops (outstanding − collected)
    emptiesToCollect: stops.filter((s) => s.status !== "delivered").reduce((a, s) => a + Math.max(0, (s.bottlesOutstanding ?? 0) - (s.bottlesCollected ?? 0)), 0),
  };

  return ok({
    driver: { name: driver.user?.name ?? "Executive", employeeId: driver.employeeId, vehicleNo: driver.vehicleNo, rating: driver.rating },
    route: routeSummary,
    date: win.iso,
    isFallbackDate: fellBack,
    stops,
  });
});
