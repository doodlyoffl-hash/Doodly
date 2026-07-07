/* GET /api/account/rewards — the signed-in customer's DOODLY Pure Rewards
   summary: tier, available / lifetime points, redeemable value, tier progress,
   expiring points, earn rules and recent points history. Backed by the loyalty
   ledger (single source of truth). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { getLoyaltySummary } from "@/lib/loyalty/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.rewards", async (req: NextRequest) => {
  const userId = requireUserId(req);
  return ok({ rewards: await getLoyaltySummary(userId) });
});
