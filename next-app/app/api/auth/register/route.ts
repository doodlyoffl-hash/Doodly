/* POST /api/auth/register — create a customer account (email + password).
   Validates input, enforces unique email/phone, hashes the password, and
   writes an audit row. Does NOT sign the user in; the client calls signIn()
   after a 200 so the session is established through Auth.js. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { passwordSchema } from "@/lib/auth/password";
import { hashPassword } from "@/lib/auth/password";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/ratelimit";
import { sendWelcomeEmail } from "@/lib/auth/email";
import { getReferralConfig, findReferrerByCode, generateUniqueReferralCode, notifyReferrerFriendJoined } from "@/lib/referrals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: passwordSchema,
  referralCode: z.string().trim().toUpperCase().max(20).optional().or(z.literal("").transform(() => undefined)),
});

export const POST = route("auth.register", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`register:${ctx.ip ?? "anon"}`, 5, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const body = await parseBody(req, schema);

  // Anti-fraud: one account per email AND per phone (blocks multi-account referral farming).
  const existingEmail = await db.user.findUnique({ where: { email: body.email } });
  if (existingEmail) throw Errors.conflict("An account with this email already exists.");
  if (body.phone) {
    const existingPhone = await db.user.findUnique({ where: { phone: body.phone } });
    if (existingPhone) throw Errors.conflict("An account with this phone already exists.");
  }

  // Referral code (optional) — validate server-side; block registration on an invalid code.
  let referredById: string | null = null;
  if (body.referralCode) {
    const cfg = await getReferralConfig();
    if (!cfg.enabled) throw Errors.badRequest("The referral programme is currently unavailable.", { referralCode: "Referrals are paused right now." });
    const referrer = await findReferrerByCode(body.referralCode);
    if (!referrer) throw Errors.badRequest("That referral code isn't valid.", { referralCode: "Invalid or expired referral code." });
    // self-referral: the referrer can't be the same person signing up
    if ((referrer.email && referrer.email === body.email) || (body.phone && referrer.phone && referrer.phone === body.phone)) {
      throw Errors.badRequest("You can't use your own referral code.", { referralCode: "Self-referrals aren't allowed." });
    }
    referredById = referrer.id;
  }

  const passwordHash = await hashPassword(body.password);
  const referralCode = await generateUniqueReferralCode();
  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      passwordHash,
      role: "CUSTOMER",
      referralCode,
      referredById,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await audit({ userId: user.id, actorRole: "customer", action: "auth.register", target: referredById ? `${user.id} ref:${body.referralCode}` : user.id, ctx });
  if (user.email) { try { await sendWelcomeEmail(user.email, user.name); } catch { /* non-blocking */ } }
  // let the referrer know a friend joined with their code (in-app + opted-in channels)
  if (referredById) { await notifyReferrerFriendJoined(referredById, user.name); }

  return ok({ id: user.id, name: user.name, email: user.email, role: "customer", referred: !!referredById }, { status: 201 });
});
