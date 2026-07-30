/* =============================================================
   DOODLY — Executive GPS pin correction (the core engine)
   A delivery executive standing at the real door (or an ops/admin from the
   back office) corrects ONLY the customer's GPS coordinates. The text address,
   PIN code, landmark and notes are never touched. Every correction is:
     • gated (shift / assigned / active / GPS accuracy / serviceable / pin↔pincode)
     • idempotent (clientId) so offline replays never double-apply
     • recorded append-only in GeoCorrection (audit + Location History + reports)
     • propagated: Address.lat/lng + verification refreshed, every future delivery's
       warehouse distance recomputed, and each affected route re-optimised (remaining
       stops only — completed stays frozen).
   Reuses lib/addresses/verify, lib/warehouse/distance, lib/routes (via reoptimizeAffected).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";
import type { DeliveryStatus, GeoCorrectionSource } from "@prisma/client";
import { getWarehouse } from "@/lib/warehouse/config";
import { haversineKm, recomputeDeliveryDistance } from "@/lib/warehouse/distance";
import { verifyAddressLocation } from "@/lib/addresses/verify";
import { getGeoCorrectionConfig, type GeoCorrectionConfig } from "@/lib/geo/correction-config";
import { reoptimizeAffected } from "@/lib/subscriptions/deliveries";
import { log } from "@/lib/logger";

const TERMINAL: DeliveryStatus[] = ["DELIVERED", "FAILED", "SKIPPED"];
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GeoCorrectionActor {
  userId: string | null;
  role: string | null;
  driverId?: string | null;      // the executive's Driver row (exec flow only)
  execEmployeeId?: string | null;
}
export interface GeoCorrectionInput {
  deliveryId?: string | null;    // the stop in hand (exec flow)
  addressId?: string | null;     // direct address (admin back-office flow)
  device: { lat: number; lng: number; accuracyM?: number | null; capturedAt?: Date | null };
  actor: GeoCorrectionActor;
  source: GeoCorrectionSource;
  reason?: string | null;
  clientId?: string | null;
  ctx?: ReqContext;
}
export interface GeoCorrectionResult {
  ok: boolean;
  idempotent?: boolean;
  correctionId?: string;
  code?: string;                 // gate failure code (dryRun)
  reason?: string;               // human message (dryRun)
  addressId?: string;
  oldLat?: number | null; oldLng?: number | null;
  newLat?: number; newLng?: number;
  distanceMovedKm?: number | null;
  warehouseBeforeKm?: number | null;
  warehouseAfterKm?: number | null;
  verified?: boolean;
  serviceable?: boolean;
  pinMatch?: boolean;
  largeMove?: boolean;           // old→new beyond largeMoveWarnKm (UI confirm hint)
  reoptimized?: { deliveries: number; drivers: number };
}

/** On-shift = the executive has an availability that isn't OFFLINE (default AVAILABLE when no row). */
async function isOnShift(driverId: string | null | undefined): Promise<boolean> {
  if (!driverId) return false;
  const st = await db.executiveStatus.findUnique({ where: { driverId }, select: { availability: true } }).catch(() => null);
  return !st || st.availability !== "OFFLINE";
}

/** Every FUTURE (non-terminal) delivery whose EFFECTIVE address is this address —
    directly pinned, or inherited from the subscription / order when not snapshotted. */
async function futureDeliveriesForAddress(addressId: string) {
  return db.delivery.findMany({
    where: {
      status: { notIn: TERMINAL },
      OR: [
        { addressId },
        { AND: [{ addressId: null }, { subscription: { is: { addressId } } }] },
        { AND: [{ addressId: null }, { order: { is: { addressId } } }] },
      ],
    },
    select: { id: true, driverId: true, date: true },
  });
}

/**
 * Apply (or, with opts.dryRun, only evaluate) a GPS coordinate correction.
 * Throws ApiError on a hard gate failure for a real run; dryRun never throws for
 * gate failures (returns ok:false + code/reason) so the confirm screen can preview.
 */
export async function applyGeoCorrection(
  input: GeoCorrectionInput,
  opts: { dryRun?: boolean } = {},
): Promise<GeoCorrectionResult> {
  const cfg: GeoCorrectionConfig = await getGeoCorrectionConfig();
  const isExec = input.source === "EXEC_GPS" || input.source === "OFFLINE_SYNC";

  // ---- idempotency: a replayed offline submission (or a double-tap) is a no-op ----
  if (input.clientId) {
    const existing = await db.geoCorrection.findUnique({ where: { clientId: input.clientId }, select: { id: true, addressId: true, newLat: true, newLng: true } });
    if (existing) return { ok: true, idempotent: true, correctionId: existing.id, addressId: existing.addressId, newLat: existing.newLat, newLng: existing.newLng };
  }

  // ---- resolve the effective address (+ delivery context) ----
  let addressId = input.addressId ?? null;
  let deliveryDriverId: string | null = null;
  let deliveryStatus: DeliveryStatus | null = null;
  if (input.deliveryId) {
    const d = await db.delivery.findUnique({
      where: { id: input.deliveryId },
      select: {
        driverId: true, status: true, addressId: true,
        subscription: { select: { addressId: true } },
        order: { select: { addressId: true } },
      },
    });
    if (!d) throw Errors.notFound("Delivery not found.");
    deliveryDriverId = d.driverId;
    deliveryStatus = d.status;
    addressId = d.addressId ?? d.subscription?.addressId ?? d.order?.addressId ?? null;
  }
  if (!addressId) throw Errors.badRequest("No delivery address to correct.");
  const addrId: string = addressId;

  const address = await db.address.findUnique({ where: { id: addrId }, select: { id: true, userId: true, pincode: true, lat: true, lng: true } });
  if (!address) throw Errors.notFound("Address not found.");

  const oldLat = address.lat, oldLng = address.lng;
  const newLat = input.device.lat, newLng = input.device.lng;
  const wh = await getWarehouse();
  const warehouseBeforeKm = oldLat != null && oldLng != null ? round2(haversineKm({ lat: wh.lat, lng: wh.lng }, { lat: oldLat, lng: oldLng })) : null;
  const distanceMovedKm = oldLat != null && oldLng != null ? round2(haversineKm({ lat: oldLat, lng: oldLng }, { lat: newLat, lng: newLng })) : null;
  const largeMove = distanceMovedKm != null && distanceMovedKm > cfg.largeMoveWarnKm;

  // verifyAddressLocation gives us, for the NEW point: serviceable, withinRadius,
  // pin↔pincode match (the pincode-area anchor) and warehouse road distance in one call.
  const verify = await verifyAddressLocation({ pincode: address.pincode, lat: newLat, lng: newLng });
  const warehouseAfterKm = verify.distanceKm != null ? round2(verify.distanceKm) : null;

  // ---- gates ----
  const onShift = isExec ? await isOnShift(input.actor.driverId) : true;
  const gateFail = ((): { code: string; reason: string } | null => {
    if (!cfg.enabled) return { code: "disabled", reason: "GPS correction is currently disabled." };
    if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return { code: "no-coords", reason: "No valid GPS coordinates were captured." };
    if (cfg.maxAccuracyM && input.device.accuracyM != null && input.device.accuracyM > cfg.maxAccuracyM)
      return { code: "weak-signal", reason: `GPS signal too weak (±${Math.round(input.device.accuracyM)} m). Move to open sky and try again.` };
    if (!verify.serviceable) return { code: "not-serviceable", reason: "This location is outside our serviceable area." };
    if (!verify.withinRadius) return { code: "out-of-radius", reason: "This location is too far from the warehouse." };
    if (cfg.enforcePinMatch && !verify.match) return { code: "pincode-mismatch", reason: "The captured location doesn't match the customer's PIN-code area." };
    if (isExec) {
      if (cfg.requireShift && !onShift) return { code: "not-on-shift", reason: "Start your shift before updating a customer location." };
      if (cfg.requireAssigned && input.deliveryId && input.actor.driverId && deliveryDriverId !== input.actor.driverId)
        return { code: "not-assigned", reason: "You're not the executive assigned to this delivery." };
      if (input.deliveryId && deliveryStatus && TERMINAL.includes(deliveryStatus)) return { code: "delivery-closed", reason: "This delivery is already closed." };
    }
    return null;
  })();

  const preview: GeoCorrectionResult = {
    ok: !gateFail, code: gateFail?.code, reason: gateFail?.reason,
    addressId: addrId, oldLat, oldLng, newLat, newLng, distanceMovedKm, warehouseBeforeKm, warehouseAfterKm,
    verified: verify.verified, serviceable: verify.serviceable, pinMatch: verify.match, largeMove,
  };

  if (opts.dryRun) return preview;
  if (gateFail) {
    // Map gate → HTTP: authorisation-ish → 403, data-ish → 400.
    if (["not-on-shift", "not-assigned", "disabled"].includes(gateFail.code)) throw Errors.forbidden(gateFail.reason);
    throw Errors.badRequest(gateFail.reason);
  }

  // ---- commit: history row + coordinate/verification update (text fields untouched) ----
  const rec = await db.$transaction(async (tx) => {
    const created = await tx.geoCorrection.create({
      data: {
        addressId: addrId, userId: address.userId,
        deliveryId: input.deliveryId ?? null, driverId: input.actor.driverId ?? null, execEmployeeId: input.actor.execEmployeeId ?? null,
        correctedById: input.actor.userId ?? null, correctedByRole: input.actor.role ?? null,
        oldLat, oldLng, newLat, newLng, distanceMovedKm,
        deviceAccuracyM: input.device.accuracyM ?? null,
        warehouseBeforeKm, warehouseAfterKm,
        declaredPincode: address.pincode, pinMatch: verify.match,
        source: input.source, reason: input.reason ?? null, clientId: input.clientId ?? null,
        capturedAt: input.device.capturedAt ?? null,
      },
      select: { id: true },
    });
    await tx.address.update({
      where: { id: addrId },
      data: {
        lat: newLat, lng: newLng,
        verified: verify.verified, verifiedAt: verify.verified ? new Date() : null,
        serviceable: verify.serviceable, distanceFromWarehouseKm: verify.distanceKm,
      },
    });
    return created;
  });

  // ---- propagate (best-effort, never fails the correction) ----
  let reoptimized = { deliveries: 0, drivers: 0 };
  try {
    const future = await futureDeliveriesForAddress(addrId);
    for (const f of future) await recomputeDeliveryDistance(f.id, wh);
    const pairs = future.filter((f) => f.driverId).map((f) => ({ driverId: f.driverId, date: f.date }));
    await reoptimizeAffected(pairs);
    reoptimized = { deliveries: future.length, drivers: new Set(pairs.map((p) => p.driverId + "|" + p.date.toISOString().slice(0, 10))).size };
  } catch (e) {
    log.error("geo.correction", `propagate failed for address ${addrId}: ${(e as Error).message}`);
  }

  await audit({
    userId: input.actor.userId ?? null, actorRole: input.actor.role ?? null,
    action: "geo.correction.apply",
    target: `addr ${addrId}${input.deliveryId ? ` · delivery ${input.deliveryId}` : ""} · ${oldLat ?? "—"},${oldLng ?? "—"} → ${round2(newLat)},${round2(newLng)}${distanceMovedKm != null ? ` · Δ${distanceMovedKm}km` : ""} · ${input.source}`,
    ctx: input.ctx,
  });

  return { ...preview, ok: true, correctionId: rec.id, reoptimized };
}
