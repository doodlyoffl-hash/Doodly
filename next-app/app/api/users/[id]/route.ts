/* /api/users/[id] — manage one staff/customer account (admin).
   PATCH  — update name / role / status (users:edit). Only a Super Admin may
            grant or remove the super_admin role.
   DELETE — soft-delete + disable the account (users:delete). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { isValidRoleKey, roleEnumFromKey, roleKeyFromEnum } from "@/lib/auth/roles";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const SELECT = {
  id: true, name: true, email: true, phone: true, role: true, status: true,
  twoFactorOn: true, forcePwReset: true, deletedAt: true, createdAt: true,
} as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.string().refine(isValidRoleKey, "Unknown role").optional(),
  status: z.enum(["ACTIVE", "DISABLED", "LOCKED"]).optional(),
  restore: z.boolean().optional(),
});

export const PATCH = route("users.update", async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(req, "users", "edit");
  const body = await parseBody(req, patchSchema);

  const target = await db.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
  if (!target || params.id.length === 0) throw Errors.notFound("User not found.");

  // Only a super_admin may grant super_admin, or change an existing super_admin.
  const touchesSuper = body.role === "super_admin" || roleKeyFromEnum(target.role) === "super_admin";
  if (touchesSuper && actor !== "super_admin") {
    throw Errors.forbidden("Only a Super Admin can manage Super Admin accounts.");
  }

  const user = await db.user.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.role !== undefined ? { role: roleEnumFromKey(body.role) } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.restore ? { deletedAt: null, status: "ACTIVE" } : {}),
    },
    select: SELECT,
  });

  await audit({ actorRole: actor, action: body.restore ? "user.restore" : "user.update", target: user.id, ctx: reqContext(req) });
  return ok({ user });
});

export const DELETE = route("users.delete", async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(req, "users", "delete");
  const target = await db.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
  if (!target) throw Errors.notFound("User not found.");
  if (roleKeyFromEnum(target.role) === "super_admin" && actor !== "super_admin") {
    throw Errors.forbidden("Only a Super Admin can remove a Super Admin account.");
  }

  const user = await db.user.update({
    where: { id: params.id },
    data: { status: "DISABLED", deletedAt: new Date() },
    select: { id: true, status: true },
  });
  await audit({ actorRole: actor, action: "user.delete", target: user.id, ctx: reqContext(req) });
  return ok({ user });
});
