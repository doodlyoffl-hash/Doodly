/* =============================================================
   DOODLY — Deliverable-address gate (the ONE validator every order /
   subscription creation path must pass). Guarantees the address:
     • exists + belongs to the customer
     • is complete (line1 + city + valid 6-digit pincode)
     • is a live serviceable pincode
     • has real coordinates — geocode-backfilled when missing
     • is plausible — within the warehouse service radius (catches
       mis-geocodes that land a "serviceable" 520xxx address 100+ km away)
   Reuses checkServiceable + geocodeAddress + the warehouse config. A
   Super-Admin may pass `override:true` for an explicit, audited bypass —
   the only sanctioned exception (spec requirement).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { checkServiceable } from "@/lib/addresses/serviceability";
import { NOT_SERVICEABLE } from "@/lib/addresses/helpers";
import { geocodeAddress } from "@/lib/geo/geocode";
import { getWarehouse } from "@/lib/warehouse/config";
import { haversineKm } from "@/lib/warehouse/distance";
import { verifyAddressLocation, PIN_MISMATCH_MESSAGE } from "@/lib/addresses/verify";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";

export const NEEDS_PIN = "We couldn't pinpoint this address on the map. Please open it and drop a pin on your exact location, then try again.";

export interface DeliverableAddress { addressId: string; lat: number | null; lng: number | null; pincode: string; }

export interface AssertDeliverableInput {
  userId: string;
  addressId: string;
  actorRole?: string | null;
  override?: boolean;           // super-admin explicit bypass (audited)
  ctx?: ReqContext;
  label?: string;               // audit context, e.g. "checkout" | "admin.subscription" | "reward"
}

const isSuper = (role?: string | null) => role === "super_admin";

/** Throws an ApiError unless `addressId` is a fully deliverable address for `userId`.
    Backfills coordinates by geocoding when missing (persisted only if plausible). */
export async function assertDeliverableAddress(input: AssertDeliverableInput): Promise<DeliverableAddress> {
  const addr = await db.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
    select: { id: true, line1: true, city: true, pincode: true, lat: true, lng: true, buildingName: true, street: true, area: true, landmark: true, verified: true },
  });
  if (!addr) throw Errors.forbidden("That delivery address isn't on this account — please choose a saved address.");

  const override = !!input.override && isSuper(input.actorRole);
  const pincode = String(addr.pincode ?? "").replace(/\D/g, "").slice(0, 6);

  if (override) {
    await audit({ userId: input.userId, actorRole: input.actorRole ?? "super_admin", action: "address.validation_override", target: `${input.label ?? "order"} · address ${addr.id}`, ctx: input.ctx }).catch(() => {});
    return { addressId: addr.id, lat: addr.lat, lng: addr.lng, pincode };
  }

  // 1. completeness
  if (!addr.line1 || !addr.city || !/^[1-9]\d{5}$/.test(pincode)) {
    throw Errors.badRequest("This delivery address is incomplete — please edit it and add the missing details before continuing.");
  }
  // 2. serviceability (live pincode table). Empty coverage table = "serve everywhere"
  //    (preserves the checkout fallback so a fresh install isn't blocked).
  const coverage = await db.serviceablePincode.count({ where: { enabled: true, deletedAt: null } });
  if (coverage > 0) {
    const sv = await checkServiceable(pincode);
    if (!sv.serviceable) throw Errors.conflict(`${NOT_SERVICEABLE} (${pincode})`);
  }

  // 3. coordinates — backfill via geocode when missing
  let lat = addr.lat, lng = addr.lng;
  let geocoded = false;
  if (lat == null || lng == null) {
    const geo = await geocodeAddress({ buildingName: addr.buildingName, street: addr.street, area: addr.area, landmark: addr.landmark, city: addr.city, pincode }).catch(() => null);
    if (geo) { lat = geo.lat; lng = geo.lng; geocoded = true; }
  }
  if (lat == null || lng == null) throw Errors.badRequest(NEEDS_PIN, { needsPin: true });

  // 4. plausibility — must be within the warehouse service radius
  const wh = await getWarehouse();
  const km = haversineKm({ lat: wh.lat, lng: wh.lng }, { lat, lng });
  if (km > wh.maxDeliveryRadiusKm) {
    // implausibly far for a serviceable pincode → a bad/mis-geocoded coordinate.
    // Never persist a guessed point; require a real pin (blocks the 262 km-order case).
    throw Errors.badRequest(NEEDS_PIN, { needsPin: true, farKm: Math.round(km) });
  }

  // 5. pin ↔ pincode verification. Already-verified addresses fast-path (no reverse-geocode
  //    call at checkout). Grandfathered/legacy addresses (verified=false but plausible) get
  //    verified now: pin-match (pragmatic) → persist `verified` + cache serviceable/distance;
  //    a real cross-zone mismatch is rejected.
  if (!addr.verified) {
    const v = await verifyAddressLocation({ pincode, lat, lng });
    if (!v.match) throw Errors.conflict(PIN_MISMATCH_MESSAGE);
    await db.address.update({
      where: { id: addr.id },
      data: { lat, lng, verified: v.verified, verifiedAt: v.verified ? new Date() : null, serviceable: v.serviceable, distanceFromWarehouseKm: v.distanceKm },
    }).catch(() => {});
  } else if (geocoded) {
    // plausible → cache a freshly geocoded coordinate so we don't geocode again
    await db.address.update({ where: { id: addr.id }, data: { lat, lng } }).catch(() => {});
  }

  return { addressId: addr.id, lat, lng, pincode };
}
