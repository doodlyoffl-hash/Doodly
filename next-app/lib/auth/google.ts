/* Google sign-in verification.
   The storefront obtains a Google access token in the browser (Google Identity
   Services) and posts it to /api/google. We verify it by calling Google's own
   userinfo endpoint with the token — a valid response proves the token is real
   and un-expired and tells us the authenticated email. No client secret needed:
   verification is Google confirming the token it issued.

   We require a GOOGLE-verified email; DOODLY then matches/creates the account by
   that email. Returns null on any failure so the caller responds with a clean
   "couldn't verify" rather than leaking details. */
import "server-only";

type GoogleUser = { email: string; name: string };

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      email?: string; email_verified?: boolean | string; name?: string; given_name?: string;
    };
    if (!u.email) return null;
    // Google must have verified the email — never trust an unverified address.
    if (u.email_verified === false || u.email_verified === "false") return null;
    return { email: String(u.email).toLowerCase().trim(), name: (u.name || u.given_name || "").trim() };
  } catch {
    return null;
  }
}
