/* Brand-story CMS authorization. Editing the storefront brand story is a
   content/marketing action — gated on the RBAC `cms` module (marketing /
   admin / super-admin). The `doodly-role` cookie is the dev/demo stand-in. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey {
  return readRole(req);
}

export const canEditBrandStory = (role: RoleKey) => can(role, "cms", "edit");
