/* GET /api/rewards/claim?code=|token= — validate a reward for the claim page.
   Public (optional auth): when signed in, also returns the customer's addresses with
   each one's serviceability so the page can gate the redeem. Never echoes the token.
   A missing reward 404s; expired/redeemed/cancelled return with a `reason`. */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { getClaimView } from "@/lib/rewards/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("rewards.claim", async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get("code");
  const token = req.nextUrl.searchParams.get("token");
  if (!code && !token) throw Errors.badRequest("Missing reward code or link.");
  const rl = rateLimit(`reward:claim:${reqContext(req).ip || "?"}`, 30, 60_000);
  if (!rl.ok) throw Errors.tooMany();
  return ok(await getClaimView({ code, token }, readUserId(req)));
});
