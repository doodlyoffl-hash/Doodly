/* /api/users — staff/customer directory (admin).
   GET  — list users (users:view), optional ?q= search and ?role= filter.
   POST — create a user with a role + initial password (users:create).
          New users must change the password on first login (forcePwReset). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { hashPassword, passwordSchema } from "@/lib/auth/password";
import { isValidRoleKey, roleEnumFromKey } from "@/lib/auth/roles";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true, status: true,
  twoFactorOn: true, forcePwReset: true, deletedAt: true, createdAt: true,
} as const;

export const GET = route("users.list", async (req: NextRequest) => {
  requirePermission(req, "users", "view");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const roleParam = url.searchParams.get("role")?.trim();
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const take = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  const users = await db.user.findMany({
    where: {
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(roleParam && isValidRoleKey(roleParam) ? { role: roleEnumFromKey(roleParam) } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
  return ok({ users });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/).optional().or(z.literal("").transform(() => undefined)),
  role: z.string().refine(isValidRoleKey, "Unknown role"),
  password: passwordSchema,
});

export const POST = route("users.create", async (req: NextRequest) => {
  const actor = requirePermission(req, "users", "create");
  const body = await parseBody(req, createSchema);

  // Only a super_admin may mint another super_admin.
  if (body.role === "super_admin" && actor !== "super_admin") {
    throw Errors.forbidden("Only a Super Admin can create another Super Admin.");
  }
  if (await db.user.findUnique({ where: { email: body.email } })) {
    throw Errors.conflict("An account with this email already exists.");
  }
  if (body.phone && (await db.user.findUnique({ where: { phone: body.phone } }))) {
    throw Errors.conflict("An account with this phone already exists.");
  }

  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      role: roleEnumFromKey(body.role),
      passwordHash: await hashPassword(body.password),
      forcePwReset: true,
    },
    select: USER_SELECT,
  });

  await audit({ actorRole: actor, action: "user.create", target: user.id, ctx: reqContext(req) });
  return ok({ user }, { status: 201 });
});
