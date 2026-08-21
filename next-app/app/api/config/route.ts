/* GET /api/config — PUBLIC runtime config for the static storefront.
   Exposes only NEXT_PUBLIC_* values that are safe in the browser (the Google
   Maps JS key is a referrer-restricted public key, not a secret). Lets the
   static app pick up keys set in the backend's env with no redeploy of the
   static site. CORS handled by middleware for the static origin. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { getExitIntentConfig, EXIT_INTENT_DEFAULT } from "@/lib/campaign/exit-intent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("config.public", async (_req: NextRequest) => {
  // Exit-intent campaign config is presentation/targeting only (no money maths);
  // safe to expose publicly. Fall back to the built-in default if the DB read fails
  // so the storefront popup config is always well-formed.
  const exitIntent = await getExitIntentConfig().catch(() => EXIT_INTENT_DEFAULT);
  return ok({
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null,
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null,
    // Public OAuth Web client id for "Continue with Google". Safe in the browser;
    // when unset the storefront hides the Google button (graceful, no dead button).
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null,
    exitIntent,
  });
});
