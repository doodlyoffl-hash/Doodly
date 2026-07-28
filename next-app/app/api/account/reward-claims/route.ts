/* GET /api/account/reward-claims — the signed-in customer's claimable rewards
   (Puzzle Winner / manually-issued RewardRedemptions bound to them) for the
   account dashboard card. Never exposes the raw token — the card links by code. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { getUserRewards } from "@/lib/rewards/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.reward-claims", async (req: NextRequest) => {
  const userId = requireUserId(req);
  return ok(await getUserRewards(userId));
});
