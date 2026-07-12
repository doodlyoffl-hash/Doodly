/* GET /api/geo/serviceable?pincode= — the PUBLIC serviceability check, backed by
   the ServiceablePincode table (the admin's single source of truth). The frontend
   pincode checker calls this so admin add/remove/enable changes reflect live with
   no redeploy. Returns delivery area/city/state + charge/slot/eta when serviceable. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("geo.serviceable", async (req: NextRequest) => {
  const pincode = (req.nextUrl.searchParams.get("pincode") || "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode)) return ok({ valid: false, serviceable: false, pincode });
  const sp = await db.serviceablePincode.findFirst({
    where: { pincode, enabled: true, deletedAt: null },
    select: { area: true, city: true, state: true, charge: true, slot: true, eta: true, zoneId: true },
  });
  return ok(sp ? { valid: true, serviceable: true, pincode, ...sp } : { valid: true, serviceable: false, pincode });
});
