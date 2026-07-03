/* =============================================================
   DOODLY — Drivers (Delivery Executives) service
   Reuses Driver + User + DeliveryZone + DeliveryCapacity +
   ExecutiveStatus + Delivery. No duplicate tables. Powers the
   admin Drivers dashboard, list, detail, and management actions.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const AVAIL_LABEL: Record<string, string> = {
  AVAILABLE: "Available", ASSIGNED: "Busy", ACCEPTED: "Busy", OUT_FOR_DELIVERY: "On route",
  COMPLETED: "Completed", RETURNED_TO_DAIRY: "Returned", OFFLINE: "Offline", BREAK: "On leave",
};
function bucketOf(a?: string | null): "available" | "busy" | "offline" | "leave" {
  if (!a || a === "OFFLINE") return "offline";
  if (a === "AVAILABLE" || a === "RETURNED_TO_DAIRY") return "available";
  if (a === "BREAK") return "leave";
  return "busy";
}
const statusMeta = (bucket: string, active: boolean, userStatus: string): [string, string] => {
  if (!active) return ["grey", "Inactive"];
  if (userStatus === "LOCKED") return ["red", "Suspended"];
  return bucket === "available" ? ["green", "Available"] : bucket === "busy" ? ["amber", "Busy"] : bucket === "leave" ? ["blue", "On leave"] : ["grey", "Offline"];
};

function dayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { s, e };
}

export async function listDrivers(q: { search?: string; status?: string; zoneId?: string } = {}) {
  const { s, e } = dayBounds();
  const rows = await db.driver.findMany({
    where: q.status === "deleted" ? { NOT: { deletedAt: null } } : { deletedAt: null },
    orderBy: { employeeId: "asc" },
    select: {
      id: true, employeeId: true, vehicleNo: true, active: true, deletedAt: true, rating: true, zoneId: true, lastSeenAt: true,
      user: { select: { name: true, email: true, phone: true, status: true, createdAt: true } },
      capacity: { select: { maxBottles: true } },
      execStatus: { select: { availability: true, assignedBottles: true } },
      _count: { select: { deliveries: true } },
    },
  });

  const zoneIds = [...new Set(rows.map((r) => r.zoneId).filter(Boolean) as string[])];
  const zones = zoneIds.length ? await db.deliveryZone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, name: true } }) : [];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  const today = await db.delivery.groupBy({ by: ["driverId", "status"], where: { date: { gte: s, lte: e }, driverId: { not: null } }, _count: true });
  const assignedToday = new Map<string, number>(), completedToday = new Map<string, number>();
  for (const g of today) {
    if (!g.driverId) continue;
    assignedToday.set(g.driverId, (assignedToday.get(g.driverId) ?? 0) + g._count);
    if (g.status === "DELIVERED") completedToday.set(g.driverId, (completedToday.get(g.driverId) ?? 0) + g._count);
  }

  let items = rows.map((d) => {
    const bucket = bucketOf(d.execStatus?.availability);
    return {
      id: d.id, employeeId: d.employeeId ?? "—", name: d.user.name ?? "—", email: d.user.email, phone: d.user.phone ?? "",
      vehicleNo: d.vehicleNo ?? "", zoneId: d.zoneId, zone: d.zoneId ? (zoneName.get(d.zoneId) ?? "—") : "—",
      active: d.active, deleted: !!d.deletedAt, userStatus: d.user.status, suspended: d.user.status === "LOCKED",
      availability: d.execStatus?.availability ?? "OFFLINE", availabilityLabel: AVAIL_LABEL[d.execStatus?.availability ?? "OFFLINE"] ?? "Offline",
      bucket, status: statusMeta(bucket, d.active, d.user.status), rating: d.rating, capacity: d.capacity?.maxBottles ?? 45,
      assignedToday: assignedToday.get(d.id) ?? 0, completedToday: completedToday.get(d.id) ?? 0, totalDeliveries: d._count.deliveries,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null, createdAt: d.user.createdAt.toISOString(),
    };
  });

  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); items = items.filter((d) => [d.id, d.employeeId, d.name, d.phone, d.email, d.zone].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.zoneId) items = items.filter((d) => d.zoneId === q.zoneId);
  if (q.status === "active") items = items.filter((d) => d.active);
  else if (q.status === "inactive") items = items.filter((d) => !d.active);
  else if (["available", "busy", "offline", "leave"].includes(q.status ?? "")) items = items.filter((d) => d.bucket === q.status);

  return { items, stats: statsFrom(items) };
}

function statsFrom(items: { active: boolean; bucket: string }[]) {
  return {
    total: items.length,
    active: items.filter((d) => d.active).length,
    inactive: items.filter((d) => !d.active).length,
    available: items.filter((d) => d.bucket === "available" && d.active).length,
    busy: items.filter((d) => d.bucket === "busy").length,
    offline: items.filter((d) => d.bucket === "offline").length,
    leave: items.filter((d) => d.bucket === "leave").length,
  };
}

export async function driverStats() {
  const { s, e } = dayBounds();
  const [drivers, today] = await Promise.all([
    db.driver.findMany({ where: { deletedAt: null }, select: { active: true, rating: true, user: { select: { status: true } }, execStatus: { select: { availability: true } } } }),
    db.delivery.findMany({ where: { date: { gte: s, lte: e } }, select: { status: true, deliveredAt: true, date: true, driverId: true } }),
  ]);
  const bucket = (a?: string | null) => bucketOf(a);
  const assignedToday = today.filter((d) => d.driverId).length;
  const completedToday = today.filter((d) => d.status === "DELIVERED").length;
  const pending = today.filter((d) => !["DELIVERED", "FAILED", "SKIPPED"].includes(d.status)).length;
  const delivered = today.filter((d) => d.status === "DELIVERED" && d.deliveredAt);
  const times = delivered.map((d) => (d.deliveredAt!.getTime() - d.date.getTime()) / 60000).filter((m) => m > 0 && m < 600);
  const avgTimeMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const doneToday = today.filter((d) => d.status === "DELIVERED");
  return {
    total: drivers.length,
    active: drivers.filter((d) => d.active).length,
    available: drivers.filter((d) => d.active && bucket(d.execStatus?.availability) === "available").length,
    busy: drivers.filter((d) => bucket(d.execStatus?.availability) === "busy").length,
    offline: drivers.filter((d) => bucket(d.execStatus?.availability) === "offline").length,
    leave: drivers.filter((d) => bucket(d.execStatus?.availability) === "leave").length,
    suspended: drivers.filter((d) => d.user.status === "LOCKED").length,
    assignedToday, completedToday, pending, avgTimeMin,
    onTimePct: doneToday.length ? Math.round((doneToday.filter((d) => d.deliveredAt).length / doneToday.length) * 100) : 100,
    avgRating: drivers.length ? +(drivers.reduce((a, d) => a + d.rating, 0) / drivers.length).toFixed(1) : 0,
  };
}

export async function driverDetail(id: string) {
  const d = await db.driver.findUnique({
    where: { id },
    select: {
      id: true, employeeId: true, vehicleNo: true, active: true, deletedAt: true, rating: true, zoneId: true, lat: true, lng: true, lastSeenAt: true,
      user: { select: { name: true, email: true, phone: true, status: true, createdAt: true } },
      capacity: { select: { maxBottles: true } },
      execStatus: { select: { availability: true, assignedBottles: true } },
      routes: { select: { id: true, name: true } },
      deliveries: { orderBy: { date: "desc" }, take: 20, select: { id: true, date: true, status: true, bottlesIn: true, deliveredAt: true } },
    },
  });
  if (!d) throw Errors.notFound("Driver not found.");
  const zone = d.zoneId ? await db.deliveryZone.findUnique({ where: { id: d.zoneId }, select: { name: true } }) : null;
  const del = d.deliveries;
  const perf = {
    completed: del.filter((x) => x.status === "DELIVERED").length,
    failed: del.filter((x) => x.status === "FAILED").length,
    bottlesCollected: del.reduce((a, x) => a + (x.bottlesIn || 0), 0),
    total: del.length,
  };
  return {
    id: d.id, employeeId: d.employeeId, name: d.user.name, email: d.user.email, phone: d.user.phone, userStatus: d.user.status,
    vehicleNo: d.vehicleNo, zoneId: d.zoneId, zone: zone?.name ?? null, active: d.active, deleted: !!d.deletedAt, rating: d.rating,
    capacity: d.capacity?.maxBottles ?? 45, availability: d.execStatus?.availability ?? "OFFLINE",
    lat: d.lat, lng: d.lng, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, createdAt: d.user.createdAt.toISOString(),
    routes: d.routes, performance: perf,
    recentDeliveries: del.map((x) => ({ id: x.id, date: x.date.toISOString().slice(0, 10), status: x.status, bottlesIn: x.bottlesIn })),
  };
}

export async function updateDriver(id: string, patch: Record<string, unknown>, _actor: Actor) {
  const cur = await db.driver.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!cur) throw Errors.notFound("Driver not found.");
  const driverData: Record<string, unknown> = {};
  if (patch.employeeId !== undefined) {
    const emp = patch.employeeId ? String(patch.employeeId).trim() : null;
    if (emp) { const clash = await db.driver.findFirst({ where: { employeeId: emp, NOT: { id } }, select: { id: true } }); if (clash) throw Errors.conflict("That employee ID is already in use."); }
    driverData.employeeId = emp;
  }
  if (patch.vehicleNo !== undefined) driverData.vehicleNo = patch.vehicleNo ? String(patch.vehicleNo).trim() : null;
  if (patch.active != null) driverData.active = !!patch.active;
  if (patch.zoneId !== undefined) driverData.zoneId = patch.zoneId ? String(patch.zoneId) : null;
  if (patch.deleted != null) driverData.deletedAt = patch.deleted ? new Date() : null;

  await db.$transaction(async (tx) => {
    if (Object.keys(driverData).length) await tx.driver.update({ where: { id }, data: driverData });
    if (patch.maxBottles != null) {
      const mx = Math.max(1, Math.min(10000, Math.round(Number(patch.maxBottles))));
      await tx.deliveryCapacity.upsert({ where: { driverId: id }, create: { driverId: id, maxBottles: mx, active: true }, update: { maxBottles: mx } });
    }
    if (patch.suspended != null) await tx.user.update({ where: { id: cur.userId }, data: { status: patch.suspended ? "LOCKED" : "ACTIVE" } });
  });
  return { id };
}

export async function resetDriverPassword(id: string, _actor: Actor) {
  const d = await db.driver.findUnique({ where: { id }, select: { userId: true, employeeId: true } });
  if (!d) throw Errors.notFound("Driver not found.");
  const temp = "Doodly@" + Math.floor(1000 + Math.random() * 9000);
  await db.user.update({ where: { id: d.userId }, data: { passwordHash: await hashPassword(temp), forcePwReset: true } });
  return { id, tempPassword: temp };
}

export type DriverBulkAction = "activate" | "deactivate" | "assignZone" | "delete" | "restore";
export async function bulkDrivers(args: { action: DriverBulkAction; ids: string[]; zoneId?: string | null }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one driver.");
  let data: Record<string, unknown>;
  switch (args.action) {
    case "activate": data = { active: true }; break;
    case "deactivate": data = { active: false }; break;
    case "assignZone": data = { zoneId: args.zoneId || null }; break;
    case "delete": data = { deletedAt: new Date(), active: false }; break;
    case "restore": data = { deletedAt: null, active: true }; break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  const res = await db.driver.updateMany({ where: { id: { in: ids } }, data });
  return { action: args.action, count: res.count };
}
