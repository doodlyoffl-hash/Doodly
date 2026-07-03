/* /api/users/[id]/reset-password — admin-initiated password reset (users:edit).
   POST { password?, force? }
     - password given → set it + require change on next login
     - force (no password) → just flip forcePwReset so the user must reset via the
       forgot-password flow on next login (no secret handled here)
   Super Admin accounts can only be reset by a Super Admin. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { hashPassword, passwordSchema } from "@/lib/auth/password";
import { roleKeyFromEnum } from "@/lib/auth/roles";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const bodySchema = z.object({
  password: passwordSchema.optional(),
  force: z.boolean().optional(),
});

export const POST = route("users.reset_password", async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(req, "users", "edit");
  const body = await parseBody(req, bodySchema);

  const target = await db.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
  if (!target) throw Errors.notFound("User not found.");
  if (roleKeyFromEnum(target.role) === "super_admin" && actor !== "super_admin") {
    throw Errors.forbidden("Only a Super Admin can reset a Super Admin password.");
  }

  await db.user.update({
    where: { id: params.id },
    data: {
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      forcePwReset: true,
    },
    select: { id: true },
  });
  await audit({ actorRole: actor, action: "auth.password_reset", target: params.id, ctx: reqContext(req) });
  return ok({ reset: true, forced: true });
});
