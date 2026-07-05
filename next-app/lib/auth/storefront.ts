/* =============================================================
   DOODLY — Resolve the STOREFRONT base URL for customer-facing links
   (e.g. the password-reset link). This must land on the static
   storefront, NEVER this backend. We deliberately do NOT use
   NEXT_PUBLIC_SITE_URL (that is the backend's own url) nor
   req.nextUrl.origin (also the backend when called cross-origin).

   Priority:
     1) NEXT_PUBLIC_STOREFRONT_URL — explicit override.
     2) The request Origin, IF it is an allow-listed storefront —
        reusing STATIC_ORIGINS (the same CORS allow-list the storefront
        already uses to call the API) plus a built-in default set.
     3) Canonical storefront default.
   Unknown / spoofed origins fall back to the default, so a reset link
   can never be pointed at an attacker-controlled host.
   ============================================================= */
type HeaderReq = { headers: { get(name: string): string | null } };

const DEFAULT_STOREFRONT = "https://www.doodly.in";

const BUILTIN_HOSTS = new Set([
  "www.doodly.in", "doodly.in", "doodly-admin.vercel.app",
  "localhost:4173", "127.0.0.1:4173",
]);

function configuredOrigins(): string[] {
  return (process.env.STATIC_ORIGINS || "")
    .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

function isStorefrontOrigin(origin: string): boolean {
  const o = origin.replace(/\/+$/, "");
  if (configuredOrigins().includes(o)) return true;   // same allow-list CORS uses
  try { return BUILTIN_HOSTS.has(new URL(o).host); } catch { return false; }
}

export function storefrontBase(req: HeaderReq): string {
  const explicit = process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const origin = req.headers.get("origin");
  if (origin && isStorefrontOrigin(origin)) return origin.replace(/\/$/, "");
  return DEFAULT_STOREFRONT;
}
