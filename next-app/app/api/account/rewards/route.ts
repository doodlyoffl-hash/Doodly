/* GET /api/account/rewards — the signed-in customer's loyalty rewards:
   points, tier, redeemable value, and recent reward-type wallet credits
   (cashback / referral / promo). */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = [
  { name: "Platinum", min: 1500 },
  { name: "Gold", min: 500 },
  { name: "Silver", min: 0 },
] as const;
const POINT_PAISE = 10; // 10 points = ₹1

export const GET = route("account.rewards", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const user = await db.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } });
  if (!user) throw Errors.notFound("Account not found.");

  const points = user.loyaltyPoints;
  const tier = TIERS.find((t) => points >= t.min) ?? TIERS[TIERS.length - 1];
  const nextTier = [...TIERS].reverse().find((t) => t.min > points) ?? null;

  const activity = await db.walletTxn.findMany({
    where: { userId, type: "CREDIT", kind: { in: ["cashback", "referral", "promo"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, kind: true, amountPaise: true, description: true, createdAt: true },
  });

  return ok({
    rewards: {
      points,
      tier: tier.name,
      nextTier: nextTier ? { name: nextTier.name, pointsAway: nextTier.min - points } : null,
      redeemablePaise: points * POINT_PAISE,
      activity,
    },
  });
});
