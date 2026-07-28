/* =============================================================
   DOODLY — Reward expiry maintenance (daily cron)
   1. Mark past-due ISSUED rewards EXPIRED (housekeeping, so admin lists/counts
      stay accurate without waiting for a lazy read).
   2. Remind customers whose bound, still-unclaimed reward expires in exactly
      7 / 3 / 1 days — an early nudge, a heads-up and a last-chance.
   Idempotent by construction: each threshold is an exact IST day-window, so the
   once-daily cron sends each reminder at most once per reward per threshold — no
   marker column or AppSetting needed (same trick as the coupon-expiry reminder).
   Rides the 02:00 /api/cron/notifications sweep (Vercel Hobby = 2 cron slots,
   both already spent); also callable standalone at /api/cron/rewards.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/dispatch";
import { rewardClaimUrl } from "@/lib/rewards/service";
import { log } from "@/lib/logger";

const DAY = 24 * 60 * 60 * 1000;
const REMINDER_THRESHOLDS = [7, 3, 1] as const;
const mlLabel = (ml: number) => (ml % 1000 === 0 ? `${ml / 1000} L` : `${ml} ml`);

/** Mark ISSUED rewards whose expiry has passed as EXPIRED (dashboards/counts truth). */
export async function expirePastDueRewards(now = new Date()) {
  const res = await db.rewardRedemption.updateMany({
    where: { status: "ISSUED", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return { expired: res.count };
}

/** Remind every bound, ISSUED reward expiring in exactly `days` days (IST day window). */
async function remindThreshold(now: Date, days: number) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const from = new Date(dayStart.getTime() + days * DAY);
  const to = new Date(from.getTime() + DAY - 1);
  const rows = await db.rewardRedemption.findMany({
    where: { status: "ISSUED", issuedToUserId: { not: null }, expiresAt: { gte: from, lte: to } },
    select: { code: true, token: true, campaignName: true, variantMl: true, issuedToUserId: true, expiresAt: true },
    take: 500,
  });
  let reminded = 0;
  for (const r of rows) {
    const expDate = r.expiresAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) || "soon";
    const last = days === 1;
    try {
      await notify(r.issuedToUserId!, {
        title: last ? "⏳ Last chance — claim your DOODLY reward by tomorrow!" : `🎁 Your DOODLY reward expires in ${days} days`,
        body: `Your FREE ${mlLabel(r.variantMl)} A2 Buffalo Milk reward ("${r.campaignName}") is still unclaimed and expires ${expDate}. Claim it now: ${rewardClaimUrl(r.token)} — or enter code ${r.code} at doodly.in/rewards/claim.`,
        email: true,
        emailSubject: last ? "Last chance: your DOODLY reward expires tomorrow" : "Your free DOODLY reward is expiring soon",
      });
      reminded++;
    } catch { /* notify never throws, but stay non-blocking regardless */ }
  }
  return { candidates: rows.length, reminded };
}

export async function runRewardExpiryReminders(now = new Date()) {
  const expired = await expirePastDueRewards(now);
  const reminders: Record<string, { candidates: number; reminded: number }> = {};
  let remindedTotal = 0;
  for (const days of REMINDER_THRESHOLDS) {
    const r = await remindThreshold(now, days);
    reminders[`t${days}`] = r;
    remindedTotal += r.reminded;
  }
  log.info("cron.rewards", "reward expiry maintenance complete", { expired: expired.expired, reminded: remindedTotal });
  return { expired: expired.expired, reminded: remindedTotal, reminders };
}
