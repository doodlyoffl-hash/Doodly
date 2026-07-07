/* POST /api/account/rewards/redeem — redeem DOODLY Points for wallet credit.
   Server-authoritative: the ratio, minimum and balance are enforced in the
   service against LoyaltyConfig + the ledger; the customer only sends the
   points amount. Idempotent when an idemKey is supplied. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { redeemPoints } from "@/lib/loyalty/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  points: z.number().int().positive().max(100_000_000),
  idemKey: z.string().min(1).max(80).optional(),
});

const MESSAGES: Record<string, string> = {
  disabled: "The rewards programme is currently unavailable.",
  invalid_amount: "Enter a valid number of points to redeem.",
  below_min: "That's below the minimum redemption.",
  not_whole_rupee: "Points must convert to a whole rupee amount.",
  insufficient: "You don't have enough points for that.",
  error: "Couldn't process the redemption. Please try again.",
};

export const POST = route("account.rewards.redeem", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { points, idemKey } = await parseBody(req, schema);
  const res = await redeemPoints({ userId, points, idemKey, createdById: userId });
  if (!res.ok) {
    throw Errors.badRequest(MESSAGES[res.reason] || "Redemption failed.", res.detail ? { detail: res.detail } : undefined);
  }
  return ok(res);
});
