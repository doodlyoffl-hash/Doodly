/* =============================================================
   Secure, self-contained access links for a business invoice PDF.
   A short signed JWT (HS256 with the same AUTH_SECRET Auth.js uses)
   scopes access to ONE invoice for a limited time — so the emailed
   "View / Download Invoice" links are shareable-safe without exposing
   the whole admin surface, and no login is required for the business
   customer to open their own document.
   ============================================================= */
import "server-only";
import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "b2b-invoice";
function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(s);
}

/** The backend's own absolute base URL (where the PDF endpoint lives).
    Shared resolver — customers click these invoice links, so it must never fall
    back to a per-deployment Vercel host (Deployment Protection → login page). */
import { backendBase } from "@/lib/public-url";
export { backendBase };

/** Sign a time-boxed access token for one invoice (default 60 days). */
export async function signInvoiceToken(invoiceId: string, ttlDays = 60): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, inv: invoiceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .setIssuer("doodly")
    .sign(secret());
}

/** Verify a token and return its invoiceId, or null if invalid/expired/wrong-scope. */
export async function verifyInvoiceToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "doodly" });
    if (payload.purpose !== PURPOSE || typeof payload.inv !== "string") return null;
    return payload.inv;
  } catch {
    return null;
  }
}

/** Absolute, signed links used in the invoice email. `dl` forces attachment download. */
export async function invoiceLinks(invoiceId: string): Promise<{ view: string; download: string }> {
  const token = await signInvoiceToken(invoiceId);
  const base = `${backendBase()}/api/b2b/invoices/${invoiceId}/pdf?token=${encodeURIComponent(token)}`;
  return { view: base, download: `${base}&dl=1` };
}
