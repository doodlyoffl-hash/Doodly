/* =============================================================
   DOODLY — Automatic "Reached Customer" geofence detection.

   The delivery executive taps "On the way" (status ON_THE_WAY) and their GPS
   stream flows to POST /api/delivery/track. Right after the distance engine
   ingests a batch, this evaluates each accuracy-gated fix against the customer's
   verified pin: once the exec stays within `radiusM` for `minStaySeconds`, the
   stop auto-flips to REACHED — recording arrival time, coordinates, distance from
   the pin and GPS accuracy. "Delivered" is NEVER touched here (stays manual).

   Server-authoritative on purpose: the client can't fake an arrival (reuses the
   accuracy gate), and an OFFLINE batch replayed on reconnect detects the arrival
   at its true historical `capturedAt`, idempotently (a conditional REACHED flip
   guarded on status ON_THE_WAY never double-fires). Reuses haversineKm + the
   geo-correction gate philosophy (shift → assigned → status → accuracy → pin).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { haversineKm } from "@/lib/warehouse/distance";
import { getGeofenceConfig } from "@/lib/delivery/geofence-config";
import { currentShift } from "@/lib/delivery/shift";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";
import type { RawGpsPoint } from "@/lib/delivery/gps-track";

/** A cleaned, accuracy-gated fix used for proximity/dwell math. */
interface Fix { lat: number; lng: number; accuracyM: number | null; capturedAt: Date }

export interface ArrivalEvent {
  deliveryId: string;
  reachedAt: string;         // ISO — the true arrival moment (fix capturedAt, so offline replays stay accurate)
  distanceM: number;         // metres from the customer pin at arrival
  accuracyM: number | null;  // GPS accuracy at arrival
}

export interface DetectActor { userId?: string | null; role?: string | null; ctx?: ReqContext }

/** Hysteresis: only a fix clearly OUTSIDE (radius × this) resets the dwell clock, so
    GPS jitter around the edge doesn't keep restarting the timer. */
const EXIT_FACTOR = 1.5;

/**
 * Evaluate a driver's incoming GPS batch and auto-mark REACHED any assigned
 * ON_THE_WAY stop the exec has entered (radius + dwell). Returns the arrivals so
 * the caller can surface them to the exec app immediately. Never throws.
 */
export async function detectArrivals(driverId: string, points: RawGpsPoint[], actor: DetectActor = {}): Promise<ArrivalEvent[]> {
  try {
    const cfg = await getGeofenceConfig();
    if (!cfg.enabled) return [];                                   // Step 12 — auto-reach disabled

    // GATE (Step 4): the exec must be on an OPEN shift.
    const shift = await currentShift(driverId);
    if (!shift) return [];

    // Normalise + accuracy-gate the incoming fixes (Step 4/5 — ignore weak/poor signal), oldest-first.
    const fixes: Fix[] = (points || [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), accuracyM: p.accuracyM == null ? null : Number(p.accuracyM), capturedAt: new Date(p.capturedAt) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !isNaN(p.capturedAt.getTime()))
      .filter((p) => p.accuracyM == null || p.accuracyM <= cfg.minAccuracyM)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    if (!fixes.length) return [];

    // Only the driver's own, currently ON_THE_WAY stops are candidates (Step 4 — assigned + status).
    // Effective pin = snapshot address → subscription address → order address (mirrors geo-correction).
    const stops = await db.delivery.findMany({
      where: { driverId, status: "ON_THE_WAY" },
      select: {
        id: true, geofenceEnteredAt: true, reachedAt: true,
        address: { select: { lat: true, lng: true, verified: true } },
        subscription: { select: { address: { select: { lat: true, lng: true, verified: true } } } },
        order: { select: { address: { select: { lat: true, lng: true, verified: true } } } },
      },
    });
    if (!stops.length) return [];

    const RADIUS_KM = cfg.radiusM / 1000;
    const EXIT_KM = (cfg.radiusM * EXIT_FACTOR) / 1000;
    const events: ArrivalEvent[] = [];

    for (const s of stops) {
      const addr = s.address ?? s.subscription?.address ?? s.order?.address ?? null;
      if (!addr || addr.lat == null || addr.lng == null) continue;      // no pin → can't geofence (edge case)
      if (cfg.requireVerifiedPin && !addr.verified) continue;           // unverified pin → never auto-fire
      const target = { lat: addr.lat, lng: addr.lng };

      // Dwell state carries across track batches via Delivery.geofenceEnteredAt (offline-safe).
      let enteredAt: Date | null = s.geofenceEnteredAt ?? null;
      let arrival: { fix: Fix; distM: number } | null = null;

      for (const f of fixes) {
        const distKm = haversineKm(f, target);
        if (distKm <= RADIUS_KM) {
          if (!enteredAt) enteredAt = f.capturedAt;                     // first time inside — start the dwell clock
          const stayedS = (f.capturedAt.getTime() - enteredAt.getTime()) / 1000;
          if (stayedS >= cfg.minStaySeconds) { arrival = { fix: f, distM: Math.round(distKm * 1000) }; break; }
        } else if (distKm > EXIT_KM) {
          enteredAt = null;                                             // clearly left (drive-past) — reset dwell
        }
        // between RADIUS and EXIT → keep the clock (hysteresis against edge jitter)
      }

      // Persist a dwell-entry change so the clock survives to the next batch. Guarded on ON_THE_WAY.
      if ((enteredAt?.getTime() ?? null) !== (s.geofenceEnteredAt?.getTime() ?? null)) {
        await db.delivery.updateMany({ where: { id: s.id, status: "ON_THE_WAY" }, data: { geofenceEnteredAt: enteredAt } }).catch(() => {});
        if (enteredAt && !s.geofenceEnteredAt) {
          await audit({ userId: actor.userId ?? null, actorRole: actor.role ?? null, action: "delivery.geofence.entered", target: `${s.id} · within ${cfg.radiusM}m of pin`, ctx: actor.ctx }).catch(() => {});
        }
      }

      if (!arrival) continue;

      // Auto-reach: flip a still-ON_THE_WAY stop → REACHED. First REACHED wins reachedAt
      // (an offline replay uses the fix's true historical time, not the sync time).
      const reachedAt = s.reachedAt ?? arrival.fix.capturedAt;
      const res = await db.delivery.updateMany({
        where: { id: s.id, status: "ON_THE_WAY" },                     // idempotency guard — no double-fire
        data: {
          status: "REACHED",
          reachedAt,
          reachedAuto: true,
          reachedDistanceM: arrival.distM,
          reachedAccuracyM: arrival.fix.accuracyM,
          reachedLat: arrival.fix.lat,
          reachedLng: arrival.fix.lng,
          geofenceEnteredAt: enteredAt,
        },
      });
      if (res.count === 0) continue;                                    // already advanced by another batch/manual tap

      events.push({ deliveryId: s.id, reachedAt: reachedAt.toISOString(), distanceM: arrival.distM, accuracyM: arrival.fix.accuracyM });
      await audit({
        userId: actor.userId ?? null, actorRole: actor.role ?? null, action: "delivery.reached.auto",
        target: `${s.id} · ${arrival.distM}m from pin · ±${arrival.fix.accuracyM != null ? Math.round(arrival.fix.accuracyM) : "?"}m accuracy`,
        ctx: actor.ctx,
      }).catch(() => {});
      // Step 10 (future-ready): a notify() "Your DOODLY executive has arrived" hook belongs here — intentionally NOT sent now.
    }

    return events;
  } catch {
    return [];   // detection must never break GPS ingestion
  }
}
