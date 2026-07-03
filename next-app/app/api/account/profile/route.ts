/* /api/account/profile — the signed-in customer's own profile.
   GET   — read name / email / phone / loyalty / referral code.
   PATCH — update name, email, phone (uniqueness enforced). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = {
  id: true, name: true, email: true, phone: true,
  loyaltyPoints: true, walletPaise: true, referralCode: true,
  twoFactorOn: true, createdAt: true,
} as const;

export const GET = route("account.profile.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const profile = await db.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!profile) throw Errors.notFound("Account not found.");
  return ok({ profile });
});

const patchSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional(),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone number")
    .optional().or(z.literal("").transform(() => undefined)),
});

export const PATCH = route("account.profile.update", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, patchSchema);

  if (body.email) {
    const clash = await db.user.findFirst({ where: { email: body.email, NOT: { id: userId } } });
    if (clash) throw Errors.conflict("That email is already in use by another account.");
  }
  if (body.phone) {
    const clash = await db.user.findFirst({ where: { phone: body.phone, NOT: { id: userId } } });
    if (clash) throw Errors.conflict("That phone number is already in use by another account.");
  }

  const profile = await db.user.update({
    where: { id: userId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
    },
    select: SELECT,
  });

  await audit({ userId, actorRole: "customer", action: "account.profile.update", target: userId, ctx: reqContext(req) });
  return ok({ profile });
});
