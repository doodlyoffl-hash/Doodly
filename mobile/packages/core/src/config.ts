/* =============================================================
   DOODLY mobile — runtime configuration.
   The apps talk to the SAME Next.js backend as the website; nothing
   here duplicates business logic, it only says where that backend is.

   Base URL resolution (first hit wins):
     1. a value saved at runtime via setApiBase()  — QA/staging switch
     2. EXPO_PUBLIC_API_BASE from the build profile (eas.json)
     3. PROD_BASE below
   Mirrors assets/js/api.js on the web so both clients agree on the host.
   ============================================================= */

/** Production backend (next-app on Vercel). Same constant the static
 *  storefront uses — keep the two in step if the backend ever moves. */
export const PROD_BASE = "https://doodly-backendstore.vercel.app";

let override: string | null = null;

const strip = (u: string) => String(u || "").replace(/\/+$/, "");

/** Point the app at a different backend (staging, a laptop on the LAN).
 *  Persisted by the caller — this module stays storage-agnostic so it can
 *  be imported from anywhere without pulling in native modules. */
export function setApiBase(url: string | null) {
  override = url ? strip(url) : null;
}

export function apiBase(): string {
  if (override) return override;
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
  if (fromEnv) return strip(fromEnv);
  return PROD_BASE;
}

/** Runtime keys the backend hands out publicly (Razorpay key id, Maps key,
 *  Google client id). Fetched from GET /api/config rather than baked into
 *  the binary, so rotating a key does NOT require a store release. */
export interface PublicConfig {
  razorpayKeyId?: string | null;
  mapsKey?: string | null;
  googleClientId?: string | null;
  [k: string]: unknown;
}

/** How long a cached /api/config stays fresh. Keys rotate rarely; this is
 *  short enough to pick up a rotation same-day without hammering the API. */
export const CONFIG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
