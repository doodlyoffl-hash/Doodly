/* GET /api/account/referrals — the signed-in customer's referral programme:
   their code + share URL, the friends they referred, and total referral earnings. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.referrals", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const user = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) throw Errors.notFound("Account not found.");

  const [friends, earnings] = await Promise.all([
    db.user.findMany({ where: { referredById: userId }, orderBy: { createdAt: "desc" }, take: 50, select: { name: true, createdAt: true } }),
    db.walletTxn.aggregate({ where: { userId, type: "CREDIT", kind: "referral" }, _sum: { amountPaise: true } }),
  ]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const code = user.referralCode.slice(0, 10).toUpperCase();

  return ok({
    referral: {
      code,
      shareUrl: base ? `${base}/signup?ref=${code}` : `/signup?ref=${code}`,
      referredCount: friends.length,
      earningsPaise: earnings._sum.amountPaise ?? 0,
      friends: friends.map((f) => ({ name: f.name ?? "A friend", joinedAt: f.createdAt })),
    },
  });
});
