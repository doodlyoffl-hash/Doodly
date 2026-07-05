/* GET /api/referral/validate?code=DOODLYABC — public, real-time referral-code check
   used by the registration page. Returns whether the code is valid + the referrer's
   first name (privacy) + the current reward policy. Never reveals whether an email/
   phone exists. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { getReferralConfig, findReferrerByCode } from "@/lib/referrals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("referral.validate", async (req: NextRequest) => {
  const code = (new URL(req.url).searchParams.get("code") || "").trim();
  if (!code) return ok({ valid: false, reason: "Enter a referral code." });
  const cfg = await getReferralConfig();
  if (!cfg.enabled) return ok({ valid: false, reason: "Referrals are paused right now." });
  const referrer = await findReferrerByCode(code);
  if (!referrer) return ok({ valid: false, reason: "Invalid or expired referral code." });
  const firstName = (referrer.name || "a DOODLY member").split(/\s+/)[0];
  return ok({ valid: true, referrerName: firstName, rewardAmountPaise: cfg.rewardAmountPaise, minPlanDays: cfg.minPlanDays });
});
