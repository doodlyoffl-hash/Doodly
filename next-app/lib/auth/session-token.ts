/* Storefront bearer-token minting — the signed HS256 token the cross-origin
   static site sends as `Authorization: Bearer …`. Shared by /api/token (password
   sign-in) and /api/google (Google sign-in) so both issue identical sessions
   that middleware.ts verifies the same way. */
import "server-only";
import { SignJWT } from "jose";
import { isStaff } from "@/lib/auth/roles";
import type { RoleKey } from "@/lib/rbac";

// Role-scoped session lifetime: staff tokens are short-lived; customers long.
export function ttlDaysFor(role: string): number {
  if (isStaff(role as RoleKey)) return 3;
  if (role === "delivery_executive") return 7;
  return 30;
}

export async function mintStorefrontToken(user: { id: string; role: string; tokenVersion: number }) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const role = String(user.role || "customer").toLowerCase();
  const ttlDays = ttlDaysFor(role);
  const token = await new SignJWT({ role, tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .setIssuer("doodly")
    .setAudience("doodly-static")
    .sign(new TextEncoder().encode(secret));
  return { token, expiresInDays: ttlDays };
}
