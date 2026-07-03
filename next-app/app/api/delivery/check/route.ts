/* /api/delivery/check?pincode=520013 — PUBLIC serviceability check for
   storefront checkout. No auth (read-only coverage lookup). CORS handled
   by middleware for the static origin. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { checkPincode } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("delivery.check", async (req: NextRequest) => {
  const pincode = req.nextUrl.searchParams.get("pincode") ?? "";
  return ok(await checkPincode(pincode));
});
