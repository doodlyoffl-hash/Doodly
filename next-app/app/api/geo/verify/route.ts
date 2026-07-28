/* GET /api/geo/verify?lat=&lng=&pincode= — PUBLIC pin ↔ PIN-code integrity check.
   Confirms the dropped map pin's location actually agrees with the entered PIN code,
   is serviceable, and is within the warehouse radius. Powers the address form's live
   "location matches PIN ✓ / does not match ✗" feedback. Read-only; never throws. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { verifyAddressLocation, PIN_MISMATCH_MESSAGE } from "@/lib/addresses/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("geo.verify", async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  const pincode = sp.get("pincode") ?? "";
  const r = await verifyAddressLocation({ pincode, lat, lng });
  return ok({ ...r, message: r.match ? null : PIN_MISMATCH_MESSAGE });
});
