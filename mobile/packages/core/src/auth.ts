/* =============================================================
   DOODLY mobile — authentication.
   Reuses the backend's EXISTING bearer-token endpoints; no new session
   concept is invented here.

     POST /api/token   email + password  → { token, expiresInDays, user }
     POST /api/google  google access tok → same shape
     POST /api/logout  bumps User.tokenVersion (kills ALL devices)

   The token is an HS256 JWT (iss "doodly", aud "doodly-static") that
   middleware.ts verifies on every /api/* call — identical to how the
   static storefront authenticates. Token lifetime is role-scoped by the
   server: customers 30d, delivery executives 7d, staff 3d.

   NOT YET AVAILABLE (backend work, Phase 2): phone + OTP sign-in and
   Apple Sign-In. Both are declared here so the UI can be written against
   the final shape, and both throw a clear error until the routes exist.
   ============================================================= */
import { api, ApiError } from "./client";
import { setToken, setStoredUser, clearSession, getToken, getStoredUser, type StoredUser } from "./storage";

export interface AuthResult {
  token: string;
  expiresInDays: number;
  user: StoredUser;
}

/** Roles allowed to use each app. Checked client-side purely to give a
 *  helpful message ("this is the customer app") — the server is still the
 *  authority and will 403 anything a role may not touch. */
export const CUSTOMER_ROLES = ["customer"] as const;
export const DRIVER_ROLES = ["delivery_executive", "super_admin"] as const;

async function persist(result: AuthResult): Promise<AuthResult> {
  await setToken(result.token);
  await setStoredUser(result.user);
  return result;
}

/** Email + password. The one sign-in path that works against the backend
 *  as it stands today. */
export async function loginWithEmail(email: string, password: string): Promise<AuthResult> {
  const data = await api.post<AuthResult>(
    "/api/token",
    { email: email.trim().toLowerCase(), password },
    { anonymous: true },
  );
  return persist(data);
}

/** Google Sign-In. The native SDK returns an access token; the backend
 *  verifies it against Google's userinfo endpoint and find-or-creates the
 *  user, returning the same bearer token as /api/token. */
export async function loginWithGoogle(accessToken: string): Promise<AuthResult> {
  const data = await api.post<AuthResult>("/api/google", { accessToken }, { anonymous: true });
  return persist(data);
}

/* ------------------------------------------------ mobile-number sign-in */

export interface OtpSent {
  sent: true;
  /** Seconds until another code may be requested. */
  retryAfterSec: number;
  /** Seconds this code stays valid. */
  expiresInSec: number;
}

/** Send a 6-digit code by SMS. Answers identically whether or not the number
 *  has an account — the server deliberately won't confirm who is a customer. */
export async function requestOtp(phone: string): Promise<OtpSent> {
  return api.post<OtpSent>("/api/otp/send", { phone: normalisePhone(phone) }, { anonymous: true });
}

/** Verify a code and exchange it for a bearer token. A first-time number
 *  gets a customer account created (possession of the number is proven). */
export async function verifyOtp(phone: string, code: string): Promise<AuthResult & { isNewAccount?: boolean }> {
  const data = await api.post<AuthResult & { isNewAccount?: boolean }>(
    "/api/otp/verify",
    { phone: normalisePhone(phone), code },
    { anonymous: true },
  );
  await persist(data);
  return data;
}

/** Apple Sign-In — MANDATORY for App Store review because we also offer
 *  Google. `fullName` is only available on the FIRST authorisation; Apple
 *  never sends it again, so pass it through whenever present. */
export async function loginWithApple(identityToken: string, fullName?: string | null): Promise<AuthResult> {
  const data = await api.post<AuthResult>("/api/apple", { identityToken, fullName }, { anonymous: true });
  return persist(data);
}

/* ------------------------------------------------------------ session ops */

/** Ends the session on this device. Also bumps tokenVersion server-side,
 *  which invalidates every other device — deliberate: it's the "I lost my
 *  phone" lever. Local state is cleared even if the call fails, so the user
 *  is never stuck signed-in offline. */
export async function logout(): Promise<void> {
  try { await api.post("/api/logout"); }
  catch { /* best-effort — clearing locally is what matters */ }
  finally { await clearSession(); }
}

/** Restore a session at app launch. Returns null when there's no stored
 *  token, or when the server has since rejected it (revoked/expired). */
export async function restoreSession(): Promise<StoredUser | null> {
  const token = await getToken();
  if (!token) return null;

  const cached = await getStoredUser();
  try {
    // Re-validate against the server so a revoked token doesn't let the
    // app render a stale signed-in shell before the first real request.
    const profile = await api.get<{ id: string; name?: string; email?: string; phone?: string; role: string }>("/api/account/profile");
    const user: StoredUser = {
      id: profile.id, name: profile.name, email: profile.email,
      phone: profile.phone, role: profile.role ?? cached?.role ?? "customer",
    };
    await setStoredUser(user);
    return user;
  } catch (e) {
    // 401 already cleared the session inside the client. Any other failure
    // (offline, 500) must NOT sign the user out — fall back to the cached
    // identity so the app opens usably on a plane.
    if (e instanceof ApiError && e.code === "unauthorized") return null;
    return cached;
  }
}

/** +91 default, digits only, E.164 without the plus — matches how the
 *  backend stores and messages Indian numbers. */
export function normalisePhone(input: string): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(input: string): boolean {
  const d = normalisePhone(input);
  return /^91[6-9]\d{9}$/.test(d);
}
