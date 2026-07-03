/* =============================================================
   DOODLY — Session helpers for Server Components / Server Actions
   Use these in RSC (e.g. the account dashboard); API route handlers
   should use lib/auth/authorize.ts (header-based, no DB round-trip).
   ============================================================= */
import "server-only";
import { auth } from "@/auth";
import type { RoleKey } from "@/lib/rbac";

export type SessionUser = { id: string; role: RoleKey; email?: string | null; name?: string | null };

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  };
}
