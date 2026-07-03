/* /api/roles — the RBAC role catalogue + admin-managed permission overrides.
   GET  — roles with merged (code default + DB override) module levels + user counts (roles:view).
   POST — { action: "setLevel"|"reset"|"resetAll"|"create"|"clone"|"delete", … } (roles:edit — super_admin).
   Durable config only: the code DEFAULT_MATRIX in lib/rbac.ts remains the hard API
   enforcement boundary (edge-safe, DB-independent). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { rolesData, setRoleLevel, resetRole, resetAllRoles, createRole, deleteRole } from "@/lib/roles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("roles.list", async (req: NextRequest) => {
  requirePermission(req, "roles", "view");
  return ok(await rolesData());
});

const postSchema = z.object({
  action: z.enum(["setLevel", "reset", "resetAll", "create", "clone", "delete"]),
  key: z.string().max(40).optional(),
  module: z.string().max(40).optional(),
  level: z.string().max(20).optional(),
  label: z.string().max(60).optional(),
  cloneFrom: z.string().max(40).optional(),
});

export const POST = route("roles.manage", async (req: NextRequest) => {
  const actor = requirePermission(req, "roles", "edit"); // super_admin only (admin has roles:view)
  const b = await parseBody(req, postSchema);
  try {
    let result: unknown; let target = "";
    if (b.action === "setLevel") { if (!b.key || !b.module) throw Errors.badRequest("key + module required"); result = await setRoleLevel(b.key, b.module, b.level ?? ""); target = `${b.key}.${b.module} = ${b.level || "none"}`; }
    else if (b.action === "reset") { if (!b.key) throw Errors.badRequest("key required"); result = await resetRole(b.key); target = b.key; }
    else if (b.action === "resetAll") { result = await resetAllRoles(); target = "all roles"; }
    else if (b.action === "create") { if (!b.key) throw Errors.badRequest("key required"); result = await createRole(b.key, b.label); target = b.key; }
    else if (b.action === "clone") { if (!b.key || !b.cloneFrom) throw Errors.badRequest("key + cloneFrom required"); result = await createRole(b.key, b.label, b.cloneFrom); target = `${b.key} ← ${b.cloneFrom}`; }
    else { if (!b.key) throw Errors.badRequest("key required"); result = await deleteRole(b.key); target = b.key; }
    await audit({ actorRole: actor, action: `role.${b.action}`, target, ctx: reqContext(req) });
    return ok({ result });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e) throw e;
    throw Errors.conflict((e as Error)?.message ?? "Action failed");
  }
});
