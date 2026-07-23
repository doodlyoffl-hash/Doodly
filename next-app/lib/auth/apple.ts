/* =============================================================
   Sign in with Apple — identity-token verification.

   The native app obtains an `identityToken` (a JWT Apple signed) and posts
   it to /api/apple. Unlike Google's flow — where we hand the token back to
   Google's userinfo endpoint — Apple's token is verified LOCALLY against
   Apple's published public keys (JWKS). That means we must check the
   audience ourselves: a token Apple issued for a DIFFERENT app is
   cryptographically valid, and accepting it would let any developer sign in
   as any DOODLY user.

   Two Apple-specific facts drive the design:

   1. PRIVATE RELAY. Users may hide behind a per-app
      xxxx@privaterelay.appleid.com alias, and that alias differs between
      apps. So the STABLE identifier is `sub`, never the email.
   2. NAME IS FIRST-TIME-ONLY. Apple returns the user's real name only on
      the very first authorisation; afterwards it's gone forever. The app
      forwards it on that first call and we persist it then or never.
   ============================================================= */
import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");

/** Bundle identifiers allowed to sign in. Both DOODLY apps, overridable via
 *  env so a rename doesn't need a code change. Apple sets `aud` to the
 *  bundle id of the app that requested the token. */
function allowedAudiences(): string[] {
  const fromEnv = (process.env.APPLE_BUNDLE_IDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : ["in.doodly.customer", "in.doodly.delivery"];
}

// Cached across invocations: jose refreshes the key set on rotation and
// coalesces concurrent fetches, so this must NOT be recreated per request.
const jwks = createRemoteJWKSet(APPLE_JWKS_URL, {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

export interface AppleIdentity {
  /** Apple's stable per-user id — the value to match accounts on. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** True when the address is an Apple private-relay alias. */
  isPrivateEmail: boolean;
}

/**
 * Verify an Apple identity token. Returns null on ANY failure (bad
 * signature, wrong audience, expired, unreachable JWKS) so the caller can
 * answer with a single opaque "couldn't verify" — never a reason that would
 * help an attacker tune their next attempt.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentity | null> {
  try {
    const { payload } = await jwtVerify(identityToken, jwks, {
      issuer: APPLE_ISSUER,
      audience: allowedAudiences(),
      // jose enforces exp/nbf itself; a small tolerance absorbs clock skew
      // between Apple and the serverless instance.
      clockTolerance: 30,
    });

    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;

    const emailRaw = typeof payload.email === "string" ? payload.email.toLowerCase().trim() : null;
    // Apple sends these as either booleans or the STRINGS "true"/"false".
    const truthy = (v: unknown) => v === true || v === "true";

    return {
      sub,
      email: emailRaw,
      emailVerified: truthy(payload.email_verified),
      isPrivateEmail: truthy(payload.is_private_email),
    };
  } catch {
    return null;
  }
}
