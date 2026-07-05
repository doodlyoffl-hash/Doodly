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
});

export const POST = route("auth.register", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`register:${ctx.ip ?? "anon"}`, 5, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const body = await parseBody(req, schema);

  const existingEmail = await db.user.findUnique({ where: { email: body.email } });
  if (existingEmail) throw Errors.conflict("An account with this email already exists.");
  if (body.phone) {
    const existingPhone = await db.user.findUnique({ where: { phone: body.phone } });
    if (existingPhone) throw Errors.conflict("An account with this phone already exists.");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      passwordHash,
      role: "CUSTOMER",
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await audit({ userId: user.id, actorRole: "customer", action: "auth.register", target: user.id, ctx });
  if (user.email) { try { await sendWelcomeEmail(user.email, user.name); } catch { /* non-blocking */ } }

  return ok({ id: user.id, name: user.name, email: user.email, role: "customer" }, { status: 201 });
});
