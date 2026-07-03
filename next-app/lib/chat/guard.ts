/* Chat Support authorization. Viewing/handling chats is available to Support &
   Admin & Super (and the chatSupport RBAC module). Reading/writing the public
   customer chat endpoint is unauthenticated (the storefront widget). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewChat = (role: RoleKey) => can(role, "chatSupport", "view") || can(role, "support", "view") || can(role, "customers", "view");
export const canManageChat = (role: RoleKey) => can(role, "chatSupport", "edit") || can(role, "support", "edit");
