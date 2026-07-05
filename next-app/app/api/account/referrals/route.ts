/* GET /api/account/referrals — the signed-in customer's referral programme:
   their DOODLY code + share link, the friends they referred (with live status),
   totals, and the current reward policy. All backend-derived. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { storefrontBase } from "@/lib/auth/storefront";
import { ensureReferralCode, getReferralConfig } from "@/lib/referrals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.referrals", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const user = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) throw Errors.notFound("Account not found.");

  const cfg = await getReferralConfig();
  const code = await ensureReferralCode(userId, user.referralCode);   // clean DOODLY code (upgrades legacy)

  const [friends, earnings, rewards] = await Promise.all([
    db.user.findMany({ where: { referredById: userId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, createdAt: true } }),
    db.walletTxn.aggregate({ where: { userId, type: "CREDIT", kind: "referral" }, _sum: { amountPaise: true }, _count: true }),
    db.referralReward.findMany({ where: { referrerId: userId } }),
  ]);
  const ids = friends.map((f) => f.id);
  const [qualSubs, paidOrders] = ids.length
    ? await Promise.all([
        db.subscription.findMany({ where: { userId: { in: ids }, plan: { days: { gte: cfg.minPlanDays } }, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { userId: true } }),
        db.order.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: "PAID" }, _count: true }),
      ])
    : [[], []];

  const rewardBy = new Map(rewards.map((r) => [r.refereeId, r]));
  const qualBy = new Set(qualSubs.map((s) => s.userId));
  const paidBy = new Set((paidOrders as { userId: string }[]).map((o) => o.userId));
  const statusOf = (id: string) => {
    const rw = rewardBy.get(id);
    if (rw?.status === "CREDITED") return "Reward Credited";
    if (rw?.status === "VOID") return "Reward Cancelled";
    if (qualBy.has(id)) return "Qualifying Subscription Purchased";
    if (paidBy.has(id)) return "First Purchase Pending";
    return "Registered";
  };

  const friendsOut = friends.map((f) => ({ name: f.name ?? "A friend", joinedAt: f.createdAt, status: statusOf(f.id) }));
  const successfulCount = rewards.filter((r) => r.status === "CREDITED").length;
  const pendingCount = friendsOut.filter((f) => f.status !== "Reward Credited" && f.status !== "Reward Cancelled").length;
  const base = storefrontBase(req).replace(/\/$/, "");

  return ok({
    referral: {
      code,
      shareUrl: `${base}/register?ref=${code}`,
      referredCount: friends.length,
      successfulCount,
      pendingCount,
      earningsPaise: earnings._sum.amountPaise ?? 0,
      rewardCount: earnings._count,
      policy: { enabled: cfg.enabled, rewardAmountPaise: cfg.rewardAmountPaise, minPlanDays: cfg.minPlanDays },
      friends: friendsOut,
    },
  });
});
