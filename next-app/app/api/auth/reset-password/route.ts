/* POST /api/auth/reset-password — complete a password reset.
   Validates the single-use, unexpired token, sets the new bcrypt hash,
   marks the token (and any other outstanding tokens for that user) used. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { passwordSchema, hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/tokens";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10, "Invalid or missing reset token"),
  password: passwordSchema,
});

export const POST = route("auth.reset", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`reset:${ctx.ip ?? "anon"}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { token, password } = await parseBody(req, schema);

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw Errors.badRequest("This reset link is invalid or has expired. Please request a new one.");
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction([
    // bump tokenVersion → instantly revoke every existing session (kicks out anyone with a stolen token)
    db.user.update({ where: { id: record.userId }, data: { passwordHash, forcePwReset: false, tokenVersion: { increment: 1 } } }),
    // burn this token and invalidate any other outstanding ones for the user
    db.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await audit({ userId: record.userId, actorRole: "customer", action: "auth.reset_password", target: record.userId, ctx });

  return ok({ message: "Your password has been reset. You can now sign in." });
});
