/* =============================================================
   DOODLY — serviceability: the ONE shared, data-driven check.
   Used by /api/geo/reverse, /api/geo/serviceable, address create/edit
   and checkout. Pincode is the primary key; input is normalised to a
   clean 6-digit code (geocoders return "520 010" etc.), then matched
   against the LIVE ServiceablePincode table (enabled + not soft-deleted)
   so admin add/remove/enable reflects instantly with no code change.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { cleanPincode } from "@/lib/geo/geocode";

export type ServiceResult =
  | { serviceable: true; pincode: string; area: string; city: string; state: string; charge: number; slot: string; eta: string | null; zoneId: string | null }
  | { serviceable: false; pincode: string | null; reason: "no-pincode" | "out-of-area" };

/** Is this pincode serviceable right now? Normalises the input first. */
export async function checkServiceable(pincodeRaw?: string | null): Promise<ServiceResult> {
  const pincode = cleanPincode(pincodeRaw);
  if (!pincode) return { serviceable: false, pincode: null, reason: "no-pincode" };
  const sp = await db.serviceablePincode.findFirst({
    where: { pincode, enabled: true, deletedAt: null },
    select: { area: true, city: true, state: true, charge: true, slot: true, eta: true, zoneId: true },
  });
  return sp ? { serviceable: true, pincode, ...sp } : { serviceable: false, pincode, reason: "out-of-area" };
}
