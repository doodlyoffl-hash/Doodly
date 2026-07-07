/* GET|POST /api/cron/loyalty — daily DOODLY Pure Rewards maintenance:
     1. expire points past their 12-month validity (FIFO, idempotent)
     2. send 30/7-day expiry reminders (opt-ins respected)
     3. award birthday points (customers whose DOB is today)
     4. award anniversary points (customers who joined on this day in a past year)
   Auth mirrors the notifications cron: Vercel Cron Bearer <CRON_SECRET>, or
   Vercel's own x-vercel-cron header when no secret is set. Every award is
   idempotent (reference keyed by user + year) so a re-run never double-credits. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expireDueLots, sendExpiryReminders, earn } from "@/lib/loyalty/service";
import { loyaltyEnabled } from "@/lib/loyalty/config";
import { notify } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function birthdayAwards(now: Date) {
  const m = now.getUTCMonth() + 1, d = now.getUTCDate(), year = now.getUTCFullYear();
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'CUSTOMER' AND "dob" IS NOT NULL
      AND EXTRACT(MONTH FROM "dob") = ${m} AND EXTRACT(DAY FROM "dob") = ${d}
    LIMIT 5000`;
  let awarded = 0;
  for (const r of rows) { const res = await earn.birthday(r.id, year); if ("awarded" in res && res.awarded) awarded++; }
  return { candidates: rows.length, awarded };
}

async function anniversaryAwards(now: Date) {
  const m = now.getUTCMonth() + 1, d = now.getUTCDate(), year = now.getUTCFullYear();
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'CUSTOMER'
      AND EXTRACT(MONTH FROM "createdAt") = ${m} AND EXTRACT(DAY FROM "createdAt") = ${d}
      AND EXTRACT(YEAR FROM "createdAt") < ${year}
    LIMIT 5000`;
  let awarded = 0;
  for (const r of rows) { const res = await earn.anniversary(r.id, year); if ("awarded" in res && res.awarded) awarded++; }
  return { candidates: rows.length, awarded };
}

/** Remind customers of a personally-assigned coupon (eligibility SPECIFIC) that
    expires in exactly 3 days. Day-window + daily cron = at most one reminder. */
async function couponExpiryReminders(now: Date) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const target = new Date(dayStart.getTime() + 3 * 24 * 60 * 60 * 1000);
  const targetEnd = new Date(target.getTime() + 24 * 60 * 60 * 1000 - 1);
  const coupons = await db.coupon.findMany({
    where: { active: true, deletedAt: null, eligibility: "SPECIFIC", expiresAt: { gte: target, lte: targetEnd } },
    select: { code: true, name: true, eligibleUserIds: true, expiresAt: true },
    take: 50,
  });
  let reminded = 0;
  for (const c of coupons) {
    for (const uid of c.eligibleUserIds.slice(0, 500)) {
      try {
        await notify(uid, {
          title: `Your coupon ${c.code} expires in 3 days ⏳`,
          body: `${c.name || "Your DOODLY coupon"} is valid until ${c.expiresAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Use it on your next order before it's gone.`,
          email: true,
          emailSubject: `Your DOODLY coupon ${c.code} expires soon`,
        });
        reminded++;
      } catch { /* non-blocking */ }
    }
  }
  return { coupons: coupons.length, reminded };
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const isVercelCron = !!req.headers.get("x-vercel-cron");
  if (secret) {
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (!isVercelCron) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  // Expiry always runs (a disabled programme still shouldn't hold expired points);
  // reminders + birthday/anniversary earns respect the on/off switch.
  const expired = await expireDueLots(now);
  const enabled = await loyaltyEnabled();
  const reminders = enabled ? await sendExpiryReminders(now) : { reminded: 0 };
  const birthdays = enabled ? await birthdayAwards(now) : { candidates: 0, awarded: 0 };
  const anniversaries = enabled ? await anniversaryAwards(now) : { candidates: 0, awarded: 0 };
  const couponReminders = await couponExpiryReminders(now);   // independent of the loyalty switch

  return NextResponse.json({ ok: true, expired, reminders, birthdays, anniversaries, couponReminders });
}

export const GET = handle;
export const POST = handle;
