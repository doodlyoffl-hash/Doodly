/* =============================================================
   DOODLY — Serviceable pincode + zone service
   Backend-managed delivery coverage. Admins add/edit/toggle/remove
   pincodes with no code change; the storefront checkout validates
   against this list. Reuses the canonical DeliveryZone / ServiceablePincode
   models (also used by delivery logistics: addresses, routes).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const PIN_RE = /^\d{6}$/;

function mapPin(p: {
  id: string; pincode: string; area: string; city: string; state: string;
  zoneId: string | null; charge: number; slot: string; eta: string | null;
  enabled: boolean; deletedAt: Date | null; createdAt: Date; updatedAt: Date; zone?: { id: string; name: string } | null;
}) {
  return {
    id: p.id, pincode: p.pincode, area: p.area, city: p.city, state: p.state,
    zoneId: p.zoneId, zone: p.zone?.name ?? null, charge: p.charge, slot: p.slot,
    eta: p.eta, enabled: p.enabled, deleted: !!p.deletedAt,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listPincodes(q: { search?: string; status?: "active" | "inactive" | "deleted"; zoneId?: string } = {}) {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const rows = await db.serviceablePincode.findMany({
    where: q.status === "deleted" ? { NOT: { deletedAt: null } } : { deletedAt: null },
    include: { zone: { select: { id: true, name: true } } },
    orderBy: [{ city: "asc" }, { pincode: "asc" }],
  });
  let items = rows.map(mapPin);
  if (q.search && q.search.trim()) {
    const s = q.search.trim().toLowerCase();
    items = items.filter((p) => [p.pincode, p.area, p.city, p.state, p.zone].some((v) => (v ?? "").toLowerCase().includes(s)));
  }
  if (q.status === "active") items = items.filter((p) => p.enabled);
  if (q.status === "inactive") items = items.filter((p) => !p.enabled);
  if (q.zoneId) items = items.filter((p) => p.zoneId === q.zoneId);

  // area-level + coverage stats (reuse Address + Delivery; live areas only, excludes soft-deleted)
  const live = rows;
  const areasOf = (list: typeof rows) => new Set(list.map((p) => `${p.area}|${p.city}`));
  const totalAreas = areasOf(live).size;
  const activeAreas = areasOf(live.filter((p) => p.enabled)).size;
  const enabledPins = live.filter((p) => p.enabled).map((p) => p.pincode);
  const [covered, ordersToday, deletedCount] = await Promise.all([
    enabledPins.length ? db.address.findMany({ where: { pincode: { in: enabledPins } }, select: { userId: true }, distinct: ["userId"] }) : Promise.resolve([]),
    db.delivery.count({ where: { date: { gte: startToday, lte: endToday } } }),
    db.serviceablePincode.count({ where: { NOT: { deletedAt: null } } }),
  ]);
  const stats = {
    total: live.length,
    active: live.filter((p) => p.enabled).length,
    inactive: live.filter((p) => !p.enabled).length,
    deleted: deletedCount,
    cities: new Set(live.map((p) => p.city)).size,
    zones: new Set(live.map((p) => p.zoneId).filter(Boolean)).size,
    totalAreas,
    activeAreas,
    inactiveAreas: totalAreas - activeAreas,
    pendingActivation: totalAreas - activeAreas,
    customersCovered: covered.length,
    ordersToday,
  };
  return { items, stats };
}

export async function createPincode(input: {
  pincode: string; area: string; city: string; state?: string; zoneId?: string | null;
  charge?: number; slot?: string; eta?: string | null; enabled?: boolean;
}, _actor: Actor) {
  const pincode = String(input.pincode || "").trim();
  if (!PIN_RE.test(pincode)) throw Errors.badRequest("Pincode must be exactly 6 digits.");
  if (!input.area?.trim()) throw Errors.badRequest("Area is required.");
  if (!input.city?.trim()) throw Errors.badRequest("City is required.");
  const dupe = await db.serviceablePincode.findUnique({ where: { pincode } });
  if (dupe) throw Errors.conflict("That pincode is already serviceable.");
  const created = await db.serviceablePincode.create({
    data: {
      pincode, area: input.area.trim(), city: input.city.trim(), state: (input.state ?? "Andhra Pradesh").trim(),
      zoneId: input.zoneId || null, charge: clampCharge(input.charge), slot: input.slot?.trim() || "6:00–8:00 AM",
      eta: input.eta?.trim() || null, enabled: input.enabled !== false,
    },
    include: { zone: { select: { id: true, name: true } } },
  });
  return mapPin(created);
}

export async function updatePincode(id: string, patch: Record<string, unknown>, _actor: Actor) {
  const cur = await db.serviceablePincode.findUnique({ where: { id } });
  if (!cur) throw Errors.notFound("Pincode not found.");
  const data: Record<string, unknown> = {};
  if (patch.area != null) { if (!String(patch.area).trim()) throw Errors.badRequest("Area cannot be empty."); data.area = String(patch.area).trim(); }
  if (patch.city != null) data.city = String(patch.city).trim();
  if (patch.state != null) data.state = String(patch.state).trim();
  if (patch.zoneId !== undefined) data.zoneId = patch.zoneId ? String(patch.zoneId) : null;
  if (patch.charge != null) data.charge = clampCharge(patch.charge);
  if (patch.slot != null) data.slot = String(patch.slot).trim();
  if (patch.eta !== undefined) data.eta = patch.eta ? String(patch.eta).trim() : null;
  if (patch.enabled != null) data.enabled = !!patch.enabled;
  const next = await db.serviceablePincode.update({ where: { id }, data, include: { zone: { select: { id: true, name: true } } } });
  return mapPin(next);
}

/** Soft-delete (restorable) — keeps history + lets areas be re-activated. */
export async function deletePincode(id: string, _actor: Actor) {
  const cur = await db.serviceablePincode.findUnique({ where: { id } });
  if (!cur) throw Errors.notFound("Pincode not found.");
  await db.serviceablePincode.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
  return { id, pincode: cur.pincode };
}

export async function restorePincode(id: string, _actor: Actor) {
  const cur = await db.serviceablePincode.findUnique({ where: { id } });
  if (!cur) throw Errors.notFound("Pincode not found.");
  await db.serviceablePincode.update({ where: { id }, data: { deletedAt: null, enabled: true } });
  return { id, pincode: cur.pincode };
}

export type BulkAction = "activate" | "deactivate" | "assignZone" | "delete" | "restore";
export async function bulkPincodes(args: { action: BulkAction; ids: string[]; zoneId?: string | null }, _actor: Actor) {
  const ids = [...new Set((args.ids || []).filter(Boolean))];
  if (!ids.length) throw Errors.badRequest("Select at least one pincode.");
  const where = { id: { in: ids } };
  let data: Record<string, unknown>;
  switch (args.action) {
    case "activate": data = { enabled: true }; break;
    case "deactivate": data = { enabled: false }; break;
    case "assignZone": data = { zoneId: args.zoneId || null }; break;
    case "delete": data = { deletedAt: new Date(), enabled: false }; break;
    case "restore": data = { deletedAt: null, enabled: true }; break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  const res = await db.serviceablePincode.updateMany({ where, data });
  return { action: args.action, count: res.count };
}

/** Bulk import (CSV rows) — upsert by pincode. Reuses createPincode validation inline. */
export async function importPincodes(rows: Array<{ pincode?: string; area?: string; city?: string; state?: string; zoneId?: string | null }>, _actor: Actor) {
  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  for (const r of rows || []) {
    const pincode = String(r.pincode ?? "").trim();
    if (!PIN_RE.test(pincode)) { skipped++; if (r.pincode) errors.push(`${r.pincode}: not a 6-digit pincode`); continue; }
    if (!r.area?.trim() || !r.city?.trim()) { skipped++; errors.push(`${pincode}: area and city are required`); continue; }
    const existing = await db.serviceablePincode.findUnique({ where: { pincode }, select: { id: true } });
    if (existing) {
      await db.serviceablePincode.update({ where: { pincode }, data: { area: r.area.trim(), city: r.city.trim(), state: (r.state ?? "Andhra Pradesh").trim(), zoneId: r.zoneId || undefined, deletedAt: null } });
      updated++;
    } else {
      await db.serviceablePincode.create({ data: { pincode, area: r.area.trim(), city: r.city.trim(), state: (r.state ?? "Andhra Pradesh").trim(), zoneId: r.zoneId || null } });
      created++;
    }
  }
  return { created, updated, skipped, errors: errors.slice(0, 20) };
}

export async function listZones() {
  const zones = await db.deliveryZone.findMany({
    include: { _count: { select: { pincodes: true, addresses: true, routes: true } } },
    orderBy: { name: "asc" },
  });
  return zones.map((z) => ({ id: z.id, name: z.name, executive: z.executive, pincodes: z._count.pincodes, addresses: z._count.addresses, routes: z._count.routes }));
}

export async function createZone(input: { name: string; executive?: string | null }, _actor: Actor) {
  if (!input.name?.trim()) throw Errors.badRequest("Zone name is required.");
  const z = await db.deliveryZone.create({ data: { name: input.name.trim(), executive: input.executive?.trim() || null } });
  return { id: z.id, name: z.name, executive: z.executive, pincodes: 0, addresses: 0, routes: 0 };
}

/** Public serviceability check for storefront checkout. */
export async function checkPincode(pincode: string) {
  const pin = String(pincode || "").trim();
  if (!PIN_RE.test(pin)) return { valid: false, serviceable: false, reason: "format" as const };
  const e = await db.serviceablePincode.findUnique({ where: { pincode: pin }, include: { zone: { select: { name: true, executive: true } } } });
  if (!e) return { valid: true, serviceable: false, reason: "out" as const, pincode: pin };
  if (!e.enabled) return { valid: true, serviceable: false, reason: "disabled" as const, pincode: pin, area: e.area, city: e.city, state: e.state };
  return {
    valid: true, serviceable: true, pincode: pin, area: e.area, city: e.city, state: e.state,
    charge: e.charge, slot: e.slot, eta: e.eta, zone: e.zone?.name ?? null, executive: e.zone?.executive ?? null,
  };
}

function clampCharge(v: unknown) { return Math.max(0, Math.min(100000, Math.round(Number(v) || 0))); }
