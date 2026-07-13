/* =============================================================
   DOODLY — Routes service (delivery routes)
   Reuses Route + Delivery (stops) + DeliveryZone + Driver + the
   assignment engine (nearest-neighbour + haversine) for optimisation.
   No duplicate tables: a "stop" is a Delivery on the route (routeId +
   sequence); optimisation reorders Delivery.sequence and stamps the
   route's distance/duration.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { orderByNearestNeighbor, haversineKm } from "@/lib/assignment/engine";
import { istDayWindow } from "@/lib/delivery/stats";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

type RouteRow = {
  id: string; name: string; code: string | null; date: Date; zoneId: string | null; driverId: string | null;
  active: boolean; deletedAt: Date | null; notes: string | null; distanceKm: number | null; durationMin: number | null;
  createdAt: Date; updatedAt: Date;
  zone?: { name: string } | null; driver?: { employeeId: string | null; user: { name: string | null } } | null;
  _count?: { deliveries: number };
};
function mapRoute(r: RouteRow) {
  return {
    id: r.id, name: r.name, code: r.code ?? "—", date: r.date.toISOString().slice(0, 10),
    zoneId: r.zoneId, zone: r.zone?.name ?? "—", driverId: r.driverId, driver: r.driver?.user?.name ?? "—", driverEmp: r.driver?.employeeId ?? null,
    stops: r._count?.deliveries ?? 0, distanceKm: r.distanceKm, durationMin: r.durationMin, active: r.active, deleted: !!r.deletedAt, notes: r.notes,
    status: r.deletedAt ? ["grey", "Deleted"] : r.active ? ["green", "Active"] : ["grey", "Inactive"],
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

const ROUTE_SELECT = {
  id: true, name: true, code: true, date: true, zoneId: true, driverId: true, active: true, deletedAt: true, notes: true, distanceKm: true, durationMin: true, createdAt: true, updatedAt: true,
  zone: { select: { name: true } }, driver: { select: { employeeId: true, user: { select: { name: true } } } }, _count: { select: { deliveries: true } },
} as const;

export async function listRoutes(q: { search?: string; status?: string; zoneId?: string; driverId?: string; date?: string } = {}) {
  // Optional IST-day filter — routes are day-scoped (Route.date). No date → all days.
  const dateWhere = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)
    ? (() => { const { start, end } = istDayWindow(q.date); return { date: { gte: start, lt: end } }; })()
    : {};
  const rows = await db.route.findMany({
    where: { ...(q.status === "deleted" ? { NOT: { deletedAt: null } } : { deletedAt: null }), ...dateWhere },
    orderBy: { date: "desc" }, take: 300, select: ROUTE_SELECT,
  });
  let items = rows.map(mapRoute);
  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); items = items.filter((r) => [r.id, r.name, r.code, r.driver, r.zone].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.zoneId) items = items.filter((r) => r.zoneId === q.zoneId);
  if (q.driverId) items = items.filter((r) => r.driverId === q.driverId);
  if (q.status === "active") items = items.filter((r) => r.active);
  else if (q.status === "inactive") items = items.filter((r) => !r.active);

  const live = items;
  const withDist = live.filter((r) => r.distanceKm != null);
  const withDur = live.filter((r) => r.durationMin != null);
  const stats = {
    total: live.length,
    active: live.filter((r) => r.active).length,
    inactive: live.filter((r) => !r.active).length,
    drivers: new Set(live.map((r) => r.driverId).filter(Boolean)).size,
    zones: new Set(live.map((r) => r.zoneId).filter(Boolean)).size,
    scheduledDeliveries: live.reduce((a, r) => a + r.stops, 0),
    avgDistanceKm: withDist.length ? +(withDist.reduce((a, r) => a + (r.distanceKm ?? 0), 0) / withDist.length).toFixed(1) : 0,
    avgDurationMin: withDur.length ? Math.round(withDur.reduce((a, r) => a + (r.durationMin ?? 0), 0) / withDur.length) : 0,
  };
  return { items, stats };
}

export async function routeStats() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  const [routes, today] = await Promise.all([
    db.route.findMany({ where: { deletedAt: null }, select: { active: true, date: true, driverId: true, zoneId: true, distanceKm: true, durationMin: true, _count: { select: { deliveries: true } } } }),
    db.delivery.findMany({ where: { date: { gte: s, lte: e } }, select: { status: true, deliveredAt: true, date: true, routeId: true } }),
  ]);
  const inUseToday = new Set(today.filter((d) => d.routeId).map((d) => d.routeId)).size;
  const withDist = routes.filter((r) => r.distanceKm != null), withDur = routes.filter((r) => r.durationMin != null);
  const done = today.filter((d) => d.status === "DELIVERED");
  return {
    total: routes.length,
    active: routes.filter((r) => r.active).length,
    inactive: routes.filter((r) => !r.active).length,
    inUseToday,
    drivers: new Set(routes.map((r) => r.driverId).filter(Boolean)).size,
    zones: new Set(routes.map((r) => r.zoneId).filter(Boolean)).size,
    scheduledDeliveries: routes.reduce((a, r) => a + r._count.deliveries, 0),
    avgDistanceKm: withDist.length ? +(withDist.reduce((a, r) => a + (r.distanceKm ?? 0), 0) / withDist.length).toFixed(1) : 0,
    avgDurationMin: withDur.length ? Math.round(withDur.reduce((a, r) => a + (r.durationMin ?? 0), 0) / withDur.length) : 0,
    onTimePct: done.length ? Math.round((done.filter((d) => d.deliveredAt).length / done.length) * 100) : 100,
  };
}

export async function routeDetail(id: string) {
  const r = await db.route.findUnique({ where: { id }, select: ROUTE_SELECT });
  if (!r) throw Errors.notFound("Route not found.");
  const deliveries = await db.delivery.findMany({
    where: { routeId: id }, orderBy: [{ sequence: "asc" }, { date: "asc" }],
    select: {
      id: true, sequence: true, status: true, bottlesIn: true, bottleCount: true, deliveredAt: true, date: true,
      subscription: { select: { user: { select: { name: true } }, address: { select: { line1: true, city: true, pincode: true, lat: true, lng: true } } } },
      order: { select: { user: { select: { name: true } } } },
    },
  });
  const stops = deliveries.map((d, i) => ({
    id: d.id, seq: d.sequence ?? i + 1, customer: d.subscription?.user?.name ?? d.order?.user?.name ?? "—",
    address: d.subscription?.address ? `${d.subscription.address.line1}, ${d.subscription.address.city} ${d.subscription.address.pincode}` : "—",
    status: d.status, bottlesIn: d.bottlesIn, bottleCount: d.bottleCount, hasGeo: d.subscription?.address?.lat != null,
    lat: d.subscription?.address?.lat ?? null, lng: d.subscription?.address?.lng ?? null,   // for the admin route map
  }));
  const performance = {
    completed: deliveries.filter((d) => d.status === "DELIVERED").length,
    pending: deliveries.filter((d) => !["DELIVERED", "FAILED", "SKIPPED"].includes(d.status)).length,
    failed: deliveries.filter((d) => d.status === "FAILED").length,
    bottlesCollected: deliveries.reduce((a, d) => a + (d.bottlesIn || 0), 0),
    total: deliveries.length,
  };
  return { ...mapRoute(r), stops, performance };
}

async function assertUniqueCode(code: string | null | undefined, exceptId?: string) {
  if (!code) return;
  const clash = await db.route.findFirst({ where: { code, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw Errors.conflict("That route code is already in use.");
}

export async function createRoute(input: { name: string; code?: string | null; date?: string; driverId?: string | null; zoneId?: string | null; notes?: string | null }, _actor: Actor) {
  if (!input.name?.trim()) throw Errors.badRequest("Route name is required.");
  const code = input.code?.trim() || null;
  await assertUniqueCode(code);
  if (input.driverId && !(await db.driver.findUnique({ where: { id: input.driverId }, select: { id: true } }))) throw Errors.badRequest("That driver does not exist.");
  const r = await db.route.create({
    data: { name: input.name.trim(), code, date: input.date ? new Date(input.date) : new Date(), driverId: input.driverId || null, zoneId: input.zoneId || null, notes: input.notes?.trim() || null },
    select: ROUTE_SELECT,
  });
  return mapRoute(r);
}

export async function updateRoute(id: string, patch: Record<string, unknown>, _actor: Actor) {
  const cur = await db.route.findUnique({ where: { id }, select: { id: true } });
  if (!cur) throw Errors.notFound("Route not found.");
  const data: Record<string, unknown> = {};
  if (patch.name != null) { if (!String(patch.name).trim()) throw Errors.badRequest("Route name cannot be empty."); data.name = String(patch.name).trim(); }
  if (patch.code !== undefined) { const c = patch.code ? String(patch.code).trim() : null; await assertUniqueCode(c, id); data.code = c; }
  if (patch.date != null) data.date = new Date(String(patch.date));
  if (patch.driverId !== undefined) { if (patch.driverId && !(await db.driver.findUnique({ where: { id: String(patch.driverId) }, select: { id: true } }))) throw Errors.badRequest("That driver does not exist."); data.driverId = patch.driverId ? String(patch.driverId) : null; }
  if (patch.zoneId !== undefined) data.zoneId = patch.zoneId ? String(patch.zoneId) : null;
  if (patch.active != null) data.active = !!patch.active;
  if (patch.notes !== undefined) data.notes = patch.notes ? String(patch.notes).trim() : null;
  if (patch.deleted != null) data.deletedAt = patch.deleted ? new Date() : null;
  const r = await db.route.update({ where: { id }, data, select: ROUTE_SELECT });
  return mapRoute(r);
}

export async function duplicateRoute(id: string, _actor: Actor) {
  const src = await db.route.findUnique({ where: { id }, select: { name: true, zoneId: true, driverId: true, notes: true } });
  if (!src) throw Errors.notFound("Route not found.");
  const r = await db.route.create({ data: { name: `${src.name} (copy)`, code: null, date: new Date(), zoneId: src.zoneId, driverId: src.driverId, notes: src.notes }, select: ROUTE_SELECT });
  return mapRoute(r);
}

/** Optimise stop order via nearest-neighbour; stamp distance + estimated duration. */
export async function optimizeRoute(id: string, _actor: Actor) {
  const route = await db.route.findUnique({ where: { id }, select: { id: true } });
  if (!route) throw Errors.notFound("Route not found.");
  const deliveries = await db.delivery.findMany({
    where: { routeId: id },
    select: { id: true, subscription: { select: { address: { select: { lat: true, lng: true } } } } },
  });
  if (deliveries.length < 1) throw Errors.badRequest("This route has no stops to optimise.");
  const pts = deliveries.map((d) => ({ id: d.id, lat: d.subscription?.address?.lat ?? null, lng: d.subscription?.address?.lng ?? null }));
  const ordered = orderByNearestNeighbor(pts);
  let distanceKm = 0;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i - 1].lat != null && ordered[i].lat != null) distanceKm += haversineKm(ordered[i - 1], ordered[i]);
  }
  distanceKm = Math.round(distanceKm * 10) / 10;
  const durationMin = Math.round(distanceKm / 20 * 60 + ordered.length * 3); // ~20 km/h + 3 min/stop
  await db.$transaction([
    ...ordered.map((o, i) => db.delivery.update({ where: { id: o.id }, data: { sequence: i + 1 } })),
    db.route.update({ where: { id }, data: { distanceKm, durationMin } }),
  ]);
  return { id, stops: ordered.length, distanceKm, durationMin };
}

export type RouteBulkAction = "activate" | "deactivate" | "assignDriver" | "delete" | "restore";
export async function bulkRoutes(args: { action: RouteBulkAction; ids: string[]; driverId?: string | null }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one route.");
  let data: Record<string, unknown>;
  switch (args.action) {
    case "activate": data = { active: true }; break;
    case "deactivate": data = { active: false }; break;
    case "assignDriver": data = { driverId: args.driverId || null }; break;
    case "delete": data = { deletedAt: new Date(), active: false }; break;
    case "restore": data = { deletedAt: null, active: true }; break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  const res = await db.route.updateMany({ where: { id: { in: ids } }, data });
  return { action: args.action, count: res.count };
}
