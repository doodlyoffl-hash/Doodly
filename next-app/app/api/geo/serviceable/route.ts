/* GET /api/geo/serviceable?pincode= — the PUBLIC serviceability check, backed by
   the ServiceablePincode table (the admin's single source of truth). The frontend
   pincode checker calls this so admin add/remove/enable changes reflect live with
   no redeploy. Returns delivery area/city/state + charge/slot/eta when serviceable. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { cleanPincode } from "@/lib/geo/geocode";
import { checkServiceable } from "@/lib/addresses/serviceability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("geo.serviceable", async (req: NextRequest) => {
  const pincode = cleanPincode(req.nextUrl.searchParams.get("pincode"));
  if (!pincode) return ok({ valid: false, serviceable: false, pincode: null });
  const r = await checkServiceable(pincode);
  return ok({ valid: true, ...r });
});
