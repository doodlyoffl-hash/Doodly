/* =============================================================
   DOODLY — the base URL for links we hand to PEOPLE.
   One shared resolver, because getting this wrong is silent: the link is
   generated, signed, delivered, and only fails when the recipient clicks it.

   VERCEL_URL is the DEPLOYMENT-specific hostname
   (doodly-backendstore-9x8f7g.vercel.app). Those hosts sit behind Vercel
   Deployment Protection, so a customer or ops user following such a link lands
   on a Vercel login page instead of their PDF. It is therefore the LAST resort,
   never the preferred source.

   Order:
     1. NEXT_PUBLIC_SITE_URL          — explicit, wins always
     2. VERCEL_PROJECT_PRODUCTION_URL — the stable production alias
     3. VERCEL_URL                    — deployment-specific, protected (fallback)
     4. http://localhost:3000         — dev
   ============================================================= */
import "server-only";

const env = (k: string) => { const v = process.env[k]; return v && v.trim() ? v.trim() : undefined; };
const withScheme = (h: string) => (/^https?:\/\//i.test(h) ? h : `https://${h}`);

/** Absolute base URL of the BACKEND, for signed links people click. */
export function backendBase(): string {
  const b =
    env("NEXT_PUBLIC_SITE_URL") ??
    (env("VERCEL_PROJECT_PRODUCTION_URL") ? withScheme(env("VERCEL_PROJECT_PRODUCTION_URL")!) : undefined) ??
    (env("VERCEL_URL") ? withScheme(env("VERCEL_URL")!) : undefined) ??
    "http://localhost:3000";
  return b.replace(/\/$/, "");
}

/** Which env supplied the base — for diagnostics, so a broken link is explainable. */
export function backendBaseSource(): "NEXT_PUBLIC_SITE_URL" | "VERCEL_PROJECT_PRODUCTION_URL" | "VERCEL_URL" | "localhost" {
  if (env("NEXT_PUBLIC_SITE_URL")) return "NEXT_PUBLIC_SITE_URL";
  if (env("VERCEL_PROJECT_PRODUCTION_URL")) return "VERCEL_PROJECT_PRODUCTION_URL";
  if (env("VERCEL_URL")) return "VERCEL_URL";
  return "localhost";
}

/** True when the base is a per-deployment Vercel host — those are protected, so
 *  any link built on one will redirect the recipient to a Vercel login page.
 *  Matches the "<project>-<hash>-<scope>.vercel.app" shape, not a clean alias. */
export function isProtectedDeploymentHost(base = backendBase()): boolean {
  try {
    const h = new URL(base).hostname;
    if (!h.endsWith(".vercel.app")) return false;
    const label = h.slice(0, -".vercel.app".length);
    // A production alias is a plain project name; a deployment URL carries a
    // generated hash segment (>=8 chars of base36) among its parts.
    return label.split("-").some((p) => p.length >= 8 && /^[a-z0-9]+$/.test(p) && /\d/.test(p));
  } catch { return false; }
}
