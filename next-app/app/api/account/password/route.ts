/* POST /api/account/password — change the signed-in user's password.
   Requires the current password (when one is set) and verifies it before
   writing the new bcrypt hash. Clears forcePwReset. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { hashPassword, verifyPassword, passwordSchema } from "@/lib/auth/password";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: passwordSchema,
});

export const POST = route("account.password.change", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const ctx = reqContext(req);
  const rl = rateLimit(`pwchange:${userId}`, 8, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { currentPassword, newPassword } = await parseBody(req, schema);

  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw Errors.notFound("Account not found.");

  // If a password is already set, the current one must be supplied and correct.
  if (user.passwordHash) {
    const okCurrent = currentPassword ? await verifyPassword(currentPassword, user.passwordHash) : false;
    if (!okCurrent) throw Errors.badRequest("Your current password is incorrect.", { currentPassword: "Incorrect password" });
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), forcePwReset: false },
  });

  await audit({ userId, actorRole: "customer", action: "account.password.change", target: userId, ctx });
  return ok({ message: "Your password has been updated." });
});
