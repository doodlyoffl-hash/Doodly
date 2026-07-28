/* =============================================================
   DOODLY — Address geolocation verification (pin ↔ PIN-code integrity).
   Given the customer-entered pincode + the dropped map pin, confirm the pin's
   location actually agrees with the pincode, is serviceable, and is within the
   warehouse radius — the check that decides `Address.verified`.

   PRAGMATIC match (chosen): the pin is only a MISMATCH when it reverse-geocodes to
   a DIFFERENT *serviceable* pincode in a DIFFERENT delivery zone than the entered
   one. Geocoder fuzz is tolerated — a blank/uncertain reverse pincode, or one that
   resolves to the same zone, is accepted (serviceable + within-radius still apply).
   Never throws: a reverse-geocode/provider outage returns match:true so a blip
   can't block address saves.
   Reuses reverseGeocode + checkServiceable + getWarehouse + the distance engine.
   ============================================================= */
import "server-only";
import { reverseGeocode, cleanPincode, geoProvider } from "@/lib/geo/geocode";
import { checkServiceable } from "@/lib/addresses/serviceability";
import { getWarehouse } from "@/lib/warehouse/config";
import { haversineKm, computeDistance } from "@/lib/warehouse/distance";

export interface VerifyInput { pincode: string; lat: number | null | undefined; lng: number | null | undefined; }
export interface VerifyResult {
  verified: boolean;          // pin present + match + serviceable + within radius
  match: boolean;             // pin location agrees with the entered pincode (pragmatic)
  serviceable: boolean;       // entered pincode is in the live coverage table
  withinRadius: boolean;      // pin is within the warehouse service radius
  reversePincode: string | null;   // pincode reverse-geocoded from the pin
  sameZone: boolean;          // reverse pincode resolves to the entered pincode's zone
  distanceKm: number | null;  // warehouse → pin (road when available, else haversine)
  reason?: "no-coords" | "geocoder-unavailable" | "pincode-mismatch" | "out-of-radius" | "not-serviceable";
}

/** Verify a dropped pin against the entered pincode. Pure/read-only; never throws. */
export async function verifyAddressLocation(input: VerifyInput): Promise<VerifyResult> {
  const entered = cleanPincode(input.pincode) ?? "";
  const lat = input.lat, lng = input.lng;
  const base = { serviceable: false, withinRadius: false, reversePincode: null as string | null, sameZone: false, distanceKm: null as number | null };

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { verified: false, match: false, ...base, reason: "no-coords" };
  }

  const wh = await getWarehouse();
  const withinRadius = haversineKm({ lat: wh.lat, lng: wh.lng }, { lat, lng }) <= wh.maxDeliveryRadiusKm;
  const enteredSv = await checkServiceable(entered);
  const serviceable = enteredSv.serviceable;
  const distanceKm = withinRadius ? (await computeDistance({ lat: wh.lat, lng: wh.lng }, { lat, lng }).catch(() => null))?.km ?? null : null;

  const rev = await reverseGeocode(lat, lng).catch(() => null);
  const reversePincode = rev ? (cleanPincode(rev.pincode ?? undefined) ?? null) : null;

  // ---- pragmatic pin ↔ pincode match ----
  let match = true;
  let sameZone = true;
  if (!rev) {
    // geocoder unavailable → can't disprove; don't block the save on a provider blip
    const verified = withinRadius && serviceable;
    return { verified, match: true, serviceable, withinRadius, reversePincode: null, sameZone: true, distanceKm, reason: verified ? "geocoder-unavailable" : (!serviceable ? "not-serviceable" : "out-of-radius") };
  }
  // Only ENFORCE a zone mismatch when the trusted provider (Google) answered. The keyless
  // OSM fallback is too imprecise for Indian pincodes to reject a customer on — treat its
  // result as advisory (serviceable + within-radius still gate).
  const trusted = geoProvider() === "google";
  if (reversePincode && reversePincode !== entered) {
    const revSv = enteredSv.serviceable ? await checkServiceable(reversePincode) : { serviceable: false } as { serviceable: boolean; zoneId?: string | null };
    const enteredZone = (enteredSv as { zoneId?: string | null }).zoneId ?? null;
    const revZone = (revSv as { zoneId?: string | null }).zoneId ?? null;
    sameZone = !!(enteredSv.serviceable && revSv.serviceable && enteredZone && revZone && enteredZone === revZone);
    // MISMATCH only for a real cross-zone move (pin is in a different serviceable zone) AND
    // only when Google confirmed it — never block on the fuzzy keyless fallback.
    if (trusted && enteredSv.serviceable && revSv.serviceable && !sameZone) match = false;
  }

  const verified = match && serviceable && withinRadius;
  const reason: VerifyResult["reason"] = !match ? "pincode-mismatch" : !serviceable ? "not-serviceable" : !withinRadius ? "out-of-radius" : undefined;
  return { verified, match, serviceable, withinRadius, reversePincode, sameZone, distanceKm, reason };
}

export const PIN_MISMATCH_MESSAGE =
  "The selected map location does not match the entered PIN code. Please correct the PIN code or move the map pin to the correct location.";
