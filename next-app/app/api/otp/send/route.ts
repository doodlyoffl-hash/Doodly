/* POST /api/otp/send — start mobile-number sign-in for the apps.

   Sends a 6-digit code by SMS. Deliberately answers the SAME way whether or
   not the number belongs to a DOODLY customer: replying "no such account"
   would turn this endpoint into a way to test which phone numbers are our
   customers. Account creation happens at /api/otp/verify instead.

   Not under /api/auth/* — that namespace is excluded from the middleware
   that attaches CORS for the storefront (see middleware.ts matcher). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { issueOtp, normalisePhone, isValidIndianMobile, TTL_MS } from "@/lib/auth/otp";
import { msg91, msg91SendSMS } from "@/lib/notifications/msg91";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ phone: z.string().trim().min(8).max(20) });

export const POST = route("auth.otp.send", async (req: NextRequest) => {
  const ctx = reqContext(req);
  // Per-IP guard on top of the per-phone throttle inside issueOtp(), so one
  // host can't cycle through many numbers.
  const rl = rateLimit(`otp-send:${ctx.ip ?? "anon"}`, 12, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { phone: raw } = await parseBody(req, Body);
  if (!isValidIndianMobile(raw)) throw Errors.badRequest("Enter a valid 10-digit mobile number.");
  const phone = normalisePhone(raw);

  const issued = await issueOtp(phone, ctx.ip ?? null);
  if (!issued.ok) {
    throw issued.reason === "too_soon"
      ? Errors.tooMany(`Please wait ${issued.retryAfterSec}s before requesting another code.`)
      : Errors.tooMany("Too many codes requested for this number. Please try again later.");
  }

  const templateId = msg91.smsTemplateFor("login_otp");
  const minutes = Math.round(TTL_MS / 60_000);

  if (msg91.smsConfigured() && templateId) {
    // DLT templates take ordered variables; ours is {#var#} = code.
    const res = await msg91SendSMS(phone, templateId, [issued.code, String(minutes)]);
    if (!res.ok && !res.skipped) {
      log.error("auth.otp", "SMS send failed", { to: phone.slice(-4), error: res.error });
      throw new Error("We couldn't send the code right now. Please try again.");
    }
  } else if (process.env.NODE_ENV === "production") {
    // Never silently "succeed" in production — the user would wait forever
    // for a code that was never sent.
    log.error("auth.otp", "no SMS provider/template configured", { to: phone.slice(-4) });
    throw new Error("SMS sign-in isn't available right now. Please sign in with your email and password.");
  } else {
    // Development: print it, so the flow is testable without an SMS bill.
    log.warn("auth.otp", `DEV ONLY — OTP for ${phone} is ${issued.code}`, {});
  }

  return ok({
    sent: true,
    retryAfterSec: issued.retryAfterSec,
    expiresInSec: Math.round(TTL_MS / 1000),
  });
});
