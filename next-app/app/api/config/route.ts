/* GET /api/config — PUBLIC runtime config for the static storefront.
   Exposes only NEXT_PUBLIC_* values that are safe in the browser (the Google
   Maps JS key is a referrer-restricted public key, not a secret). Lets the
   static app pick up keys set in the backend's env with no redeploy of the
   static site. CORS handled by middleware for the static origin. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("config.public", async (_req: NextRequest) => {
  return ok({
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null,
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null,
    // Public OAuth Web client id for "Continue with Google". Safe in the browser;
    // when unset the storefront hides the Google button (graceful, no dead button).
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null,
  });
});
