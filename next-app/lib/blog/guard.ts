/* Blog authorization. Managing posts (create/edit/publish/lifecycle) is gated on the
   RBAC `blogs` module (marketing / admin / super — the Content Editor / Marketing roles);
   viewing analytics is open to anyone who can view blogs or reports. Reading the public
   published feed is unauthenticated (the customer website). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewBlog = (role: RoleKey) => can(role, "blogs", "view") || can(role, "reports", "view") || can(role, "cms", "view");
export const canManageBlog = (role: RoleKey) => can(role, "blogs", "edit");
