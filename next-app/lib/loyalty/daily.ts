/* =============================================================
   DOODLY — daily Pure Rewards maintenance, extracted from the cron ROUTE so it
   can be invoked from more than one schedule.

   Why it moved: Vercel Hobby allows only 2 cron entries and both were spent
   (02:00 notifications, 02:30 loyalty), which left no slot for the 20:00 IST
   operations cut-off — the reason the daily WhatsApp summary never fired on
   time. Loyalty maintenance is date-based and idempotent, so it does not need
   a schedule of its own; it now rides the 02:00 sweep and frees the slot.

   Everything here is idempotent (awards are keyed by user + year), so running
   it twice in a day never double-credits.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { expireDueLots, sendExpiryReminders, earn } from "@/lib/loyalty/service";
import { loyaltyEnabled } from "@/lib/loyalty/config";
import { notify } from "@/lib/notifications/dispatch";
import { log } from "@/lib/logger";

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
    expires in exactly 3 days. Day-window + daily run = at most one reminder. */
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
        const expDate = c.expiresAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) || "soon";
        await notify(uid, {
          title: `Your coupon ${c.code} expires in 3 days ⏳`,
          body: `${c.name || "Your DOODLY coupon"} is valid until ${expDate}. Use it on your next order before it's gone.`,
          email: true,
          emailSubject: `Your DOODLY coupon ${c.code} expires soon`,
          // coupon_expiring (live): header [code] + body [code, date]
          whatsapp: { template: "coupon_expiring", vars: [c.code, c.code, expDate] },
        });
        reminded++;
      } catch { /* non-blocking */ }
    }
  }
  return { coupons: coupons.length, reminded };
}

export async function runDailyLoyaltyMaintenance(now = new Date()) {
  // Expiry always runs (a disabled programme still shouldn't hold expired points);
  // reminders + birthday/anniversary earns respect the on/off switch.
  const expired = await expireDueLots(now);
  const enabled = await loyaltyEnabled();
  const reminders = enabled ? await sendExpiryReminders(now) : { reminded: 0 };
  const birthdays = enabled ? await birthdayAwards(now) : { candidates: 0, awarded: 0 };
  const anniversaries = enabled ? await anniversaryAwards(now) : { candidates: 0, awarded: 0 };
  const couponReminders = await couponExpiryReminders(now);   // independent of the loyalty switch
  log.info("cron.loyalty", "daily maintenance complete", {
    expired: (expired as { lots?: number })?.lots ?? 0,
    birthdays: birthdays.awarded, anniversaries: anniversaries.awarded, coupons: couponReminders.reminded,
  });
  return { expired, reminders, birthdays, anniversaries, couponReminders };
}
