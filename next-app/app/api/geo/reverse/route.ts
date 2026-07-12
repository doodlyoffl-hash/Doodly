/* GET /api/geo/reverse?lat=&lng= — reverse-geocode a dropped/dragged pin into a
   structured address AND check DOODLY serviceability, in one call (Swiggy-style).
   Provider-abstracted server-side (Google when GOOGLE_MAPS_API_KEY is set, else
   keyless OpenStreetMap). Public (used live by the address picker); the SAVE
   endpoints re-validate independently, so this is UX, never the security boundary. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { reverseGeocode, geoProvider } from "@/lib/geo/geocode";
import { checkServiceable } from "@/lib/addresses/serviceability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("geo.reverse", async (req: NextRequest) => {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const addr = await reverseGeocode(lat, lng);
  if (!addr) return ok({ ok: false, provider: geoProvider(), address: null, serviceable: { serviceable: false, reason: "no-address" } });
  const serviceable = await checkServiceable(addr.pincode);
  return ok({ ok: true, provider: geoProvider(), address: addr, serviceable });
});
