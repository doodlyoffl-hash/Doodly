/* =============================================================
   DOODLY — the ONE deliverable-address creation path.
   Shared by the customer's POST /api/addresses AND the admin/assisted
   add-address (PATCH /api/admin/customers/[id] action add-address), so both
   flows enforce IDENTICAL rules: serviceable pincode + map coordinates
   (geocode fallback) + pin↔pincode verification + within the warehouse radius,
   caching verified/serviceable/distanceFromWarehouseKm. Never a parallel path.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { assertServiceable, buildAddressData, cleanStr, LOCATION_KEYS } from "@/lib/addresses/helpers";
import { geocodeAddress } from "@/lib/geo/geocode";
import { verifyAddressLocation, PIN_MISMATCH_MESSAGE } from "@/lib/addresses/verify";
import { NEEDS_PIN } from "@/lib/addresses/deliverable";
import { recomputeDeliveriesForAddress, haversineKm } from "@/lib/warehouse/distance";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";

// simple (non-location) fields a partial edit can set without re-validating serviceability
const SIMPLE_KEYS = ["label", "deliveryNote", "contactName", "contactPhone", "altPhone", "block", "wing", "gateNumber", "doorColor"] as const;

export interface CreateAddressInput { pincode: string; isDefault?: boolean; lat?: number | null; lng?: number | null; [k: string]: unknown; }
export interface CreateActor { actorRole: string; actorUserId?: string | null; ctx?: ReqContext }

/**
 * Create a fully-verified, serviceable delivery address for `ownerUserId`.
 * Throws (conflict/badRequest) exactly like POST /api/addresses when the pincode
 * isn't serviceable, no map pin can be resolved, the pin is outside the warehouse
 * radius, or the pin disagrees with the pincode — so the assisted flow can NEVER
 * silently save a non-deliverable address. Audits `address.create`.
 */
export async function createDeliverableAddress(ownerUserId: string, input: CreateAddressInput, actor: CreateActor) {
  const pincode = String(input.pincode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^[1-9]\d{5}$/.test(pincode)) throw Errors.badRequest("Enter a valid 6-digit pincode.");

  // pincode must be inside DOODLY's serviceable area (also gives area/city/state/zone)
  const sp = await assertServiceable(pincode);
  const data = buildAddressData({ ...input, pincode }, sp) as Record<string, unknown> & { lat?: number | null; lng?: number | null };

  // A map pin is REQUIRED. No pin → best-effort keyless geocode; if that also fails,
  // a pin must be dropped (map is mandatory — same rule as the customer flow).
  if (data.lat == null || data.lng == null) {
    const geo = await geocodeAddress({ ...(data as Record<string, unknown>), pincode });
    if (geo) { data.lat = geo.lat; data.lng = geo.lng; }
  }
  if (data.lat == null || data.lng == null) throw Errors.badRequest(NEEDS_PIN, { needsPin: true });

  // Verify the pin agrees with the entered pincode + is within the warehouse radius.
  const v = await verifyAddressLocation({ pincode, lat: data.lat as number, lng: data.lng as number });
  if (!v.withinRadius) throw Errors.badRequest(NEEDS_PIN, { needsPin: true, farKm: v.distanceKm ?? undefined });
  if (!v.match) throw Errors.conflict(PIN_MISMATCH_MESSAGE);

  data.verified = v.verified;
  data.verifiedAt = v.verified ? new Date() : null;
  data.serviceable = v.serviceable;
  data.distanceFromWarehouseKm = v.distanceKm;

  const count = await db.address.count({ where: { userId: ownerUserId } });
  const makeDefault = !!input.isDefault || count === 0;

  const address = await db.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId: ownerUserId }, data: { isDefault: false } });
    return tx.address.create({ data: { userId: ownerUserId, ...data, pincode, isDefault: makeDefault } as Prisma.AddressUncheckedCreateInput });
  });

  await audit({ userId: ownerUserId, actorRole: actor.actorRole, action: "address.create", target: address.id, ctx: actor.ctx }).catch(() => {});
  return address;
}

/**
 * Update one of a user's addresses through the SAME rules as the customer edit path: a location
 * change (pincode/coords/street/etc.) re-asserts serviceability, re-geocodes if the pin is
 * missing, re-verifies pin↔pincode + warehouse radius, re-caches verified/serviceable/distance,
 * and recomputes every future delivery's warehouse distance. `opts.recordHistory` (admin/staff
 * edits) additionally writes an append-only GeoCorrection row (old→new coords) for the audit trail.
 */
export async function updateDeliverableAddress(ownerUserId: string, addressId: string, body: Record<string, unknown>, actor: CreateActor, opts?: { recordHistory?: boolean }) {
  const current = await db.address.findFirst({ where: { id: addressId, userId: ownerUserId }, select: { id: true, pincode: true, lat: true, lng: true, distanceFromWarehouseKm: true } });
  if (!current) throw Errors.notFound("Address not found.");

  const editingLocation = LOCATION_KEYS.some((k) => body[k] !== undefined);
  let data: Record<string, unknown>;
  if (editingLocation) {
    const pincode = (typeof body.pincode === "string" && body.pincode.replace(/\D/g, "").slice(0, 6)) || current.pincode;
    if (!/^[1-9]\d{5}$/.test(pincode)) throw Errors.badRequest("Enter a valid 6-digit pincode.");
    const sp = await assertServiceable(pincode);
    data = buildAddressData(body, sp);
    data.pincode = pincode;
    if (data.lat == null || data.lng == null) { const geo = await geocodeAddress({ ...(data as Record<string, unknown>), pincode }); if (geo) { data.lat = geo.lat; data.lng = geo.lng; } }
    if (data.lat == null || data.lng == null) throw Errors.badRequest(NEEDS_PIN, { needsPin: true });
    const v = await verifyAddressLocation({ pincode, lat: data.lat as number, lng: data.lng as number });
    if (!v.withinRadius) throw Errors.badRequest(NEEDS_PIN, { needsPin: true, farKm: v.distanceKm ?? undefined });
    if (!v.match) throw Errors.conflict(PIN_MISMATCH_MESSAGE);
    data.verified = v.verified;
    data.verifiedAt = v.verified ? new Date() : null;
    data.serviceable = v.serviceable;
    data.distanceFromWarehouseKm = v.distanceKm;
  } else {
    data = {};
    for (const k of SIMPLE_KEYS) if (body[k] !== undefined) data[k] = cleanStr(body[k] as string);
  }

  const address = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.address.updateMany({ where: { userId: ownerUserId }, data: { isDefault: false } });
    return tx.address.update({ where: { id: addressId }, data: { ...data, ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}) } as Prisma.AddressUncheckedUpdateInput });
  });

  if (editingLocation) {
    recomputeDeliveriesForAddress(address.id).catch(() => {});
    // Address history: an ADMIN/staff move of an existing pin is recorded append-only (item 15).
    if (opts?.recordHistory && current.lat != null && current.lng != null && (current.lat !== address.lat || current.lng !== address.lng)) {
      await db.geoCorrection.create({ data: {
        addressId: address.id, userId: ownerUserId, correctedById: actor.actorUserId ?? null, correctedByRole: actor.actorRole,
        oldLat: current.lat, oldLng: current.lng, newLat: address.lat as number, newLng: address.lng as number,
        distanceMovedKm: haversineKm({ lat: current.lat, lng: current.lng }, { lat: address.lat as number, lng: address.lng as number }),
        warehouseBeforeKm: current.distanceFromWarehouseKm, warehouseAfterKm: address.distanceFromWarehouseKm,
        declaredPincode: address.pincode, source: "ADMIN", reason: "assisted-order address edit",
      } }).catch(() => {});
    }
  }

  await audit({ userId: ownerUserId, actorRole: actor.actorRole, action: "address.update", target: address.id, ctx: actor.ctx }).catch(() => {});
  return address;
}
