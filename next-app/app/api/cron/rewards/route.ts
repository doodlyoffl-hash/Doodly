/* GET|POST /api/cron/rewards — Reward-redemption expiry maintenance:
     1. mark past-due ISSUED rewards EXPIRED (housekeeping)
     2. remind customers whose bound unclaimed reward expires in 7 / 3 / 1 days
        (opt-ins respected; exact day-windows → at most one reminder each)

   SCHEDULING: no cron entry of its own — Vercel Hobby allows 2 crons and both
   are spent (02:00 notifications, 20:00 cut-off). This work rides the 02:00
   /api/cron/notifications sweep. This route stays callable for manual runs and
   re-runs — everything it does is idempotent.

   Auth mirrors the notifications cron: Vercel Cron Bearer <CRON_SECRET>, or
   Vercel's own x-vercel-cron header when no secret is set. */
import { NextRequest, NextResponse } from "next/server";
import { runRewardExpiryReminders } from "@/lib/rewards/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const isVercelCron = !!req.headers.get("x-vercel-cron");
  if (secret) {
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (!isVercelCron) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...(await runRewardExpiryReminders()) });
}

export const GET = handle;
export const POST = handle;
