/* =============================================================
   Secure, self-contained access links for the daily delivery manifest PDF.
   Superfone's documented WhatsApp API sends templates and text only — it has
   no document/media endpoint — so the manifest travels as a SIGNED LINK the
   recipient can open on their phone without an admin login.
   Same mechanism as the B2B invoice links (HS256 JWT on AUTH_SECRET), but
   scoped to ONE delivery DATE and short-lived: an operational sheet should
   stop working a few days later, unlike a 60-day invoice.
   ============================================================= */
import "server-only";
import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "ops-manifest";
const DEFAULT_TTL_DAYS = 3;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(s);
}

/** The backend's own absolute base URL (where the PDF endpoint lives).
    Shared resolver — it must never fall back to a per-deployment Vercel host,
    which Deployment Protection would turn into a login page for the recipient. */
import { backendBase } from "@/lib/public-url";
export { backendBase };

/** Sign a time-boxed token for ONE delivery day's manifest. */
export async function signManifestToken(dateIso: string, ttlDays = DEFAULT_TTL_DAYS): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, day: dateIso })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .setIssuer("doodly")
    .sign(secret());
}

/** Verify a token → the delivery date it grants, or null if invalid/expired/wrong-scope. */
export async function verifyManifestToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "doodly" });
    if (payload.purpose !== PURPOSE || typeof payload.day !== "string") return null;
    return payload.day;
  } catch {
    return null;
  }
}

/** Absolute signed link to the manifest PDF for a delivery day (used in WhatsApp/email). */
export async function manifestLink(dateIso: string, ttlDays = DEFAULT_TTL_DAYS): Promise<string | null> {
  try {
    const token = await signManifestToken(dateIso, ttlDays);
    return `${backendBase()}/api/ops/manifest?token=${encodeURIComponent(token)}`;
  } catch {
    return null;   // AUTH_SECRET missing → send the summary without a link rather than failing
  }
}
