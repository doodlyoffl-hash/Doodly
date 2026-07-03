/* /api/admin/drivers — delivery executives.
   GET  — list with linked user + assigned-delivery count (drivers:view).
   POST — onboard a new executive: creates a delivery_executive USER + Driver
          record together (drivers:create). They reset their password on first login. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { hashPassword, passwordSchema } from "@/lib/auth/password";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { listDrivers } from "@/lib/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.drivers.list", async (req: NextRequest) => {
  requirePermission(req, "drivers", "view");
  const sp = req.nextUrl.searchParams;
  const res = await listDrivers({ search: sp.get("search") ?? undefined, status: sp.get("status") ?? undefined, zoneId: sp.get("zoneId") ?? undefined });
  return ok({ drivers: res.items, stats: res.stats });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/).optional().or(z.literal("").transform(() => undefined)),
  employeeId: z.string().trim().max(20).optional(),
  vehicleNo: z.string().trim().max(20).optional(),
  password: passwordSchema,
});

export const POST = route("admin.drivers.create", async (req: NextRequest) => {
  const actor = requirePermission(req, "drivers", "create");
  const body = await parseBody(req, createSchema);

  if (await db.user.findUnique({ where: { email: body.email } })) throw Errors.conflict("An account with this email already exists.");
  if (body.phone && (await db.user.findUnique({ where: { phone: body.phone } }))) throw Errors.conflict("An account with this phone already exists.");
  if (body.employeeId && (await db.driver.findUnique({ where: { employeeId: body.employeeId } }))) throw Errors.conflict("That employee ID is already in use.");

  const driver = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: body.name, email: body.email, phone: body.phone ?? null, role: "DELIVERY_EXECUTIVE", passwordHash: await hashPassword(body.password), forcePwReset: true },
    });
    return tx.driver.create({
      data: { userId: user.id, employeeId: body.employeeId ?? null, vehicleNo: body.vehicleNo ?? null, active: true },
      select: { id: true, employeeId: true, vehicleNo: true, active: true, rating: true, user: { select: { name: true, email: true, phone: true, status: true } } },
    });
  });

  await audit({ actorRole: actor, action: "driver.create", target: driver.id, ctx: reqContext(req) });
  return ok({ driver: { ...driver, deliveries: 0 } }, { status: 201 });
});
