/* GET /api/geo/reverse?lat=&lng= — reverse-geocode a dropped/dragged pin into a
   structured address AND check DOODLY serviceability, in one call (Swiggy-style).
   Provider-abstracted server-side (Google when GOOGLE_MAPS_API_KEY is set, else
   keyless OpenStreetMap). Public (used live by the address picker); the SAVE
   endpoints re-validate independently, so this is UX, never the security boundary. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { reverseGeocode, geoProvider } from "@/lib/geo/geocode";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serviceabilityFor(pincode?: string) {
  if (!pincode || !/^[1-9]\d{5}$/.test(pincode)) return { serviceable: false, reason: "no-pincode" as const };
  const sp = await db.serviceablePincode.findFirst({ where: { pincode, enabled: true, deletedAt: null }, select: { area: true, city: true, state: true, charge: true, slot: true, eta: true } });
  return sp ? { serviceable: true as const, ...sp } : { serviceable: false as const, reason: "out-of-area" as const };
}

export const GET = route("geo.reverse", async (req: NextRequest) => {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const addr = await reverseGeocode(lat, lng);
  if (!addr) return ok({ ok: false, provider: geoProvider(), address: null, serviceable: false });
  const serviceable = await serviceabilityFor(addr.pincode);
  return ok({ ok: true, provider: geoProvider(), address: addr, serviceable });
});
