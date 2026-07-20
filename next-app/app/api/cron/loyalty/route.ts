/* GET|POST /api/cron/loyalty — daily DOODLY Pure Rewards maintenance:
     1. expire points past their 12-month validity (FIFO, idempotent)
     2. send 30/7-day expiry reminders (opt-ins respected)
     3. award birthday points (customers whose DOB is today)
     4. award anniversary points (customers who joined on this day in a past year)

   NOTE ON SCHEDULING: this no longer has a cron entry of its own. Vercel Hobby
   allows 2 crons and the third slot was needed for the 20:00 IST operations
   cut-off, whose absence meant the daily WhatsApp summary never fired on time.
   The work now rides /api/cron/notifications (02:00 UTC). This route remains
   callable for manual runs and re-runs — everything it does is idempotent.

   Auth mirrors the notifications cron: Vercel Cron Bearer <CRON_SECRET>, or
   Vercel's own x-vercel-cron header when no secret is set. */
import { NextRequest, NextResponse } from "next/server";
import { runDailyLoyaltyMaintenance } from "@/lib/loyalty/daily";

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
  return NextResponse.json({ ok: true, ...(await runDailyLoyaltyMaintenance()) });
}

export const GET = handle;
export const POST = handle;
