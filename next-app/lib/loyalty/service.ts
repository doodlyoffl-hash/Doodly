/* =============================================================
   DOODLY Pure Rewards — loyalty points engine (Prisma).

   • awardPoints(...)   — idempotent EARN. Each earn is a "lot" carrying its
                          own expiry (expiresAt) + unconsumed balance (remaining).
                          `reference` is UNIQUE → webhook/retry safe.
   • redeemPoints(...)  — validate → FIFO-consume lots (oldest expiry first) →
                          credit the customer's WALLET (reuses WalletTxn) atomically.
   • getLoyaltySummary  — tier, available/lifetime points, expiry, history.
   • expireDueLots      — cron: expire past-due lots (FIFO, idempotent).
   • sendExpiryReminders— cron: 30/7-day expiry reminders (respect opt-ins).
   • admin: listMembers / adminAdjust / reverseLedger / loyaltyReports.

   Money stays in ONE place: redemption credits the wallet via a WalletTxn
   (kind "loyalty"), so ₹ balances and history are unchanged elsewhere.
   Points are integers; the User row caches available balance (loyaltyPoints),
   lifetime earned (drives tier) and lifetime redeemed for cheap reads.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateReference } from "@/lib/wallet/engine";
import { getLoyaltyConfig, tierFor, nextTierFor, type LoyaltyConfig } from "./config";
import { notify } from "@/lib/notifications/dispatch";
import { log } from "@/lib/logger";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      if (code === "P2034" || code === "P2037") { await sleep(40 * (i + 1)); continue; }
      throw e;
    }
  }
  throw last;
}

/** Is a bonus campaign active right now? (boosts spend/activity earns) */
function campaignMultiplier(cfg: LoyaltyConfig, now = new Date()): number {
  if (cfg.campaignMultiplier && cfg.campaignMultiplier > 1 && cfg.campaignEndsAt && new Date(cfg.campaignEndsAt) > now) {
    return cfg.campaignMultiplier;
  }
  return 1;
}

export type AwardResult =
  | { awarded: true; points: number; balance: number; reference: string }
  | { awarded: false; idempotent?: boolean; reason: string };

/**
 * Award points idempotently. Creates one EARN lot (reference UNIQUE) with its own
 * expiry, then bumps the user's available + lifetime-earned caches — all atomic.
 * Respects the global on/off switch. Never throws for a duplicate (returns idempotent).
 */
export async function awardPoints(p: {
  userId: string; kind: string; reference: string; points: number;
  description?: string; orderId?: string; subscriptionId?: string;
  createdById?: string; applyCampaign?: boolean; notify?: boolean; notifyTitle?: string; notifyBody?: string;
}): Promise<AwardResult> {
  try {
    const cfg = await getLoyaltyConfig();
    if (!cfg.enabled) return { awarded: false, reason: "disabled" };

    let points = Math.round(Number(p.points) || 0);
    if (points <= 0) return { awarded: false, reason: "zero" };
    if (p.applyCampaign) points = Math.round(points * campaignMultiplier(cfg));

    // fast idempotency pre-check (the UNIQUE reference is the real guard)
    const dup = await db.loyaltyLedger.findUnique({ where: { reference: p.reference }, select: { id: true } });
    if (dup) return { awarded: false, idempotent: true, reason: "already_awarded" };

    const expiresAt = new Date(Date.now() + cfg.expiryDays * 24 * 60 * 60 * 1000);

    const res = await withRetry(() => db.$transaction(async (tx) => {
      // create the lot first → a duplicate reference fails before mutating the user
      let row;
      try {
        row = await tx.loyaltyLedger.create({
          data: {
            userId: p.userId, type: "EARN", kind: p.kind, points, remaining: points, expiresAt,
            reference: p.reference, description: p.description, orderId: p.orderId,
            subscriptionId: p.subscriptionId, createdById: p.createdById,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { idempotent: true as const };
        throw e;
      }
      const user = await tx.user.update({
        where: { id: p.userId },
        data: { loyaltyPoints: { increment: points }, loyaltyLifetimeEarned: { increment: points } },
        select: { loyaltyPoints: true, loyaltyLifetimeEarned: true },
      });
      await tx.loyaltyLedger.update({ where: { id: row.id }, data: { balanceAfter: user.loyaltyPoints } });
      return { balance: user.loyaltyPoints, lifetime: user.loyaltyLifetimeEarned, reference: row.reference };
    }, TX));

    if ("idempotent" in res) return { awarded: false, idempotent: true, reason: "already_awarded" };

    // Tier upgrade? Tier follows LIFETIME points — compare before/after this earn and
    // congratulate the member the moment they cross a threshold (in-app + email).
    try {
      const before = tierFor(res.lifetime - points, cfg.tiers);
      const after = tierFor(res.lifetime, cfg.tiers);
      if (after.min > before.min) {
        notify(p.userId, {
          title: `You're now a ${after.name}! 🎉`,
          body: `Congratulations — you've reached the ${after.name} tier of DOODLY Pure Rewards. New benefits are waiting on your Rewards page.`,
          email: true,
          emailSubject: `Welcome to ${after.name} — DOODLY Pure Rewards`,
        }).catch(() => {});
      }
    } catch { /* non-blocking */ }

    if (p.notify) {
      notify(p.userId, {
        title: p.notifyTitle || `+${points} DOODLY Points earned`,
        body: p.notifyBody || `You've earned ${points} points. Redeem them for wallet credit on the Rewards page.`,
      }).catch(() => {});
    }
    return { awarded: true, points, balance: res.balance, reference: res.reference };
  } catch (e) {
    log.error("loyalty.award", (e as Error)?.message ?? "failed", { userId: p.userId, kind: p.kind });
    return { awarded: false, reason: "error" };
  }
}

// ---------- event-specific earn helpers (all non-throwing) ----------
// Each builds a deterministic reference so the earn fires at most once per event.

export const earn = {
  registration: (userId: string) =>
    cfgEarn(userId, "registration", `earn:reg:${userId}`, (c) => c.earnRegistration, {
      notify: true, notifyTitle: "Welcome to DOODLY Pure Rewards 🥛", notifyBody: "You've earned 50 points just for joining. Start earning more with every delivery!",
    }),

  profileComplete: (userId: string) =>
    cfgEarn(userId, "profile", `earn:profile:${userId}`, (c) => c.earnProfile, {
      notify: true, notifyTitle: "Profile complete — points added!", notifyBody: "Thanks for completing your profile. Your DOODLY Points are in your Rewards wallet.",
    }),

  order: (userId: string, orderId: string, orderTotalPaise: number) =>
    cfgEarn(userId, "order", `earn:order:${orderId}`, (c) => Math.floor((orderTotalPaise / 10000) * c.pointsPerHundred), {
      orderId, applyCampaign: true, description: `Points on order ${orderId}`,
    }),

  subscribe: (userId: string, subscriptionId: string, planDays: number) =>
    cfgEarn(userId, planDays >= 90 ? "subscribe90" : "subscribe30", `earn:sub:${subscriptionId}`,
      (c) => (planDays >= 90 ? c.earnSubscribe90 : c.earnSubscribe30), {
      subscriptionId, applyCampaign: true, notify: true,
      notifyTitle: "Subscription reward added 🎉", notifyBody: "Thanks for subscribing to DOODLY — your bonus points are ready to redeem.",
    }),

  referral: (referrerId: string, refereeId: string) =>
    cfgEarn(referrerId, "referral", `earn:referral:${refereeId}`, (c) => c.earnReferral, {
      notify: true, notifyTitle: "Referral points earned 🤝", notifyBody: "A friend you referred subscribed — enjoy your bonus DOODLY Points!",
    }),

  bottleReturn: (userId: string, deliveryId: string, bottles: number) =>
    cfgEarn(userId, "bottle", `earn:bottle:${deliveryId}`, (c) => c.earnBottleReturn * Math.max(0, bottles), {
      description: `${bottles} bottle(s) returned`,
    }),

  renewal: (userId: string, subscriptionId: string, cycle: number) =>
    cfgEarn(userId, "renewal", `earn:renewal:${subscriptionId}:${cycle}`, (c) => c.earnRenewal, {
      subscriptionId, applyCampaign: true,
    }),

  deliveryStreak: (userId: string, subscriptionId: string, milestone: number) =>
    cfgEarn(userId, "streak", `earn:streak:${subscriptionId}:${milestone}`, (c) => c.earnStreak12, {
      subscriptionId, notify: true, notifyTitle: "12 deliveries — streak bonus! 🔥", notifyBody: "You've taken 12 deliveries in a row. Here's a bonus of DOODLY Points as a thank-you.",
    }),

  birthday: (userId: string, year: number) =>
    cfgEarn(userId, "birthday", `earn:birthday:${userId}:${year}`, (c) => c.earnBirthday, {
      notify: true, notifyTitle: "Happy Birthday from DOODLY 🎂", notifyBody: "A little gift of DOODLY Points to celebrate your day. Enjoy!",
    }),

  anniversary: (userId: string, year: number) =>
    cfgEarn(userId, "anniversary", `earn:anniversary:${userId}:${year}`, (c) => c.earnAnniversary, {
      notify: true, notifyTitle: "Happy DOODLY anniversary! 🥳", notifyBody: "Thank you for staying fresh with us. Enjoy your anniversary bonus points.",
    }),

  puzzlePlay: (userId: string, puzzleId: string) =>
    cfgEarn(userId, "puzzle_play", `earn:puzzle_play:${puzzleId}:${userId}`, (c) => c.earnPuzzlePlay, {}),

  puzzleWin: (userId: string, puzzleId: string) =>
    cfgEarn(userId, "puzzle_win", `earn:puzzle_win:${puzzleId}`, (c) => c.earnPuzzleWin, {
      notify: true, notifyTitle: "You won the DOODLY puzzle! 🏆", notifyBody: "Congratulations! Your winner's bonus points have been added to your rewards.",
    }),

  review: (userId: string, orderId: string) =>
    cfgEarn(userId, "review", `earn:review:${orderId}`, (c) => c.earnReview, {
      orderId,
    }),
};

/** Look up the configured amount for an earn, then award it. Never throws. */
async function cfgEarn(
  userId: string, kind: string, reference: string,
  amount: (c: LoyaltyConfig) => number,
  opts: { orderId?: string; subscriptionId?: string; description?: string; applyCampaign?: boolean; notify?: boolean; notifyTitle?: string; notifyBody?: string },
): Promise<AwardResult> {
  try {
    const cfg = await getLoyaltyConfig();
    if (!cfg.enabled) return { awarded: false, reason: "disabled" };
    const points = Math.round(amount(cfg));
    if (points <= 0) return { awarded: false, reason: "zero" };
    return awardPoints({ userId, kind, reference, points, ...opts });
  } catch (e) {
    log.error("loyalty.cfgEarn", (e as Error)?.message ?? "failed", { userId, kind });
    return { awarded: false, reason: "error" };
  }
}

/**
 * Award points for an order that just became PAID via the gateway (verify/webhook),
 * where the subscription isn't linked to the order by FK. Awards the spend points
 * (by order value) and, for a subscription order, the subscribe bonus on the user's
 * most-recent ACTIVE subscription. Both are idempotent (per order / per subscription),
 * so calling this from BOTH the verify callback and the webhook is safe.
 */
export async function awardOrderPaid(userId: string, orderId: string) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { totalPaise: true, depositPaise: true, couponDiscountPaise: true, type: true } });
    if (!order) return;
    // points on the actual product spend: minus refundable deposit, minus coupon discount
    await earn.order(userId, orderId, Math.max(0, order.totalPaise - order.depositPaise - order.couponDiscountPaise));
    if (order.type === "SUBSCRIPTION") {
      const sub = await db.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, plan: { select: { days: true } } },
      });
      if (sub?.plan) await earn.subscribe(userId, sub.id, sub.plan.days);
    }
  } catch (e) {
    log.error("loyalty.awardOrderPaid", (e as Error)?.message ?? "failed", { userId, orderId });
  }
}

// ---------- redemption (points → wallet credit) ----------

export type RedeemResult =
  | { ok: true; points: number; creditedPaise: number; pointsBalance: number; walletBalancePaise: number; idempotent?: boolean }
  | { ok: false; reason: string; detail?: Record<string, number> };

/**
 * Redeem points for wallet credit. Validates against config (enabled / minimum /
 * whole-rupee multiple / sufficient balance), consumes lots oldest-expiry-first,
 * then credits the wallet via a WalletTxn — all in one Serializable transaction.
 */
export async function redeemPoints(p: { userId: string; points: number; idemKey?: string; createdById?: string }): Promise<RedeemResult> {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { ok: false, reason: "disabled" };
  const points = Math.round(Number(p.points) || 0);
  if (points <= 0) return { ok: false, reason: "invalid_amount" };
  if (points < cfg.minRedeemPoints) return { ok: false, reason: "below_min", detail: { minPoints: cfg.minRedeemPoints } };
  if (points % cfg.redeemPointsPerRupee !== 0) return { ok: false, reason: "not_whole_rupee", detail: { perRupee: cfg.redeemPointsPerRupee } };

  const creditedPaise = Math.round((points / cfg.redeemPointsPerRupee) * 100);
  const reference = p.idemKey ? `redeem:${p.userId}:${p.idemKey}` : `redeem:${p.userId}:${generateReference()}`;

  const existing = await db.loyaltyLedger.findUnique({ where: { reference }, select: { id: true, points: true } });
  if (existing) {
    const u = await db.user.findUnique({ where: { id: p.userId }, select: { loyaltyPoints: true, walletPaise: true } });
    return { ok: true, idempotent: true, points, creditedPaise, pointsBalance: u?.loyaltyPoints ?? 0, walletBalancePaise: u?.walletPaise ?? 0 };
  }

  try {
    return await withRetry(() => db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: p.userId }, select: { loyaltyPoints: true } });
      const available = user?.loyaltyPoints ?? 0;
      if (points > available) return { ok: false as const, reason: "insufficient", detail: { available } };

      // FIFO consume unexpired lots, oldest expiry first
      const lots = await tx.loyaltyLedger.findMany({
        where: { userId: p.userId, type: "EARN", remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        select: { id: true, remaining: true },
      });
      let need = points;
      for (const lot of lots) {
        if (need <= 0) break;
        const take = Math.min(lot.remaining, need);
        await tx.loyaltyLedger.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
        need -= take;
      }
      if (need > 0) return { ok: false as const, reason: "insufficient", detail: { available } };

      // record the REDEEM row + credit the wallet, decrement points caches
      const redeemRow = await tx.loyaltyLedger.create({
        data: {
          userId: p.userId, type: "REDEEM", kind: "redemption", points, remaining: 0,
          reference, description: `Redeemed ${points} points for Rs.${Math.round(creditedPaise / 100)} wallet credit`,
          createdById: p.createdById,
        },
      });
      const updated = await tx.user.update({
        where: { id: p.userId },
        data: {
          loyaltyPoints: { decrement: points },
          loyaltyLifetimeRedeemed: { increment: points },
          walletPaise: { increment: creditedPaise },
        },
        select: { loyaltyPoints: true, walletPaise: true },
      });
      // wallet ledger entry (mirrors postTxn shape; unique reference retry)
      let walletTxnId: string | undefined;
      for (let i = 0; i < 5; i++) {
        try {
          const wt = await tx.walletTxn.create({
            data: {
              userId: p.userId, type: "CREDIT", kind: "loyalty", amountPaise: creditedPaise,
              balanceAfterPaise: updated.walletPaise, reference: generateReference(),
              description: `Loyalty redemption — ${points} points`, reason: "loyalty_redemption", createdById: p.createdById,
            },
          });
          walletTxnId = wt.id; break;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target).includes("reference")) continue;
          throw e;
        }
      }
      await tx.loyaltyLedger.update({ where: { id: redeemRow.id }, data: { balanceAfter: updated.loyaltyPoints, walletTxnId } });

      return { ok: true as const, points, creditedPaise, pointsBalance: updated.loyaltyPoints, walletBalancePaise: updated.walletPaise };
    }, TX));
  } catch (e) {
    log.error("loyalty.redeem", (e as Error)?.message ?? "failed", { userId: p.userId });
    return { ok: false, reason: "error" };
  }
}

// ---------- customer summary ----------

export async function getLoyaltySummary(userId: string) {
  const cfg = await getLoyaltyConfig();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { loyaltyPoints: true, loyaltyLifetimeEarned: true, loyaltyLifetimeRedeemed: true, createdAt: true, dob: true },
  });
  const available = user?.loyaltyPoints ?? 0;
  const lifetimeEarned = user?.loyaltyLifetimeEarned ?? 0;
  const lifetimeRedeemed = user?.loyaltyLifetimeRedeemed ?? 0;

  const tier = tierFor(lifetimeEarned, cfg.tiers);
  const up = nextTierFor(lifetimeEarned, cfg.tiers);
  const progressPct = up ? Math.max(0, Math.min(100, Math.round(((lifetimeEarned - tier.min) / (up.tier.min - tier.min)) * 100))) : 100;

  const now = new Date();
  const soonWindow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [expiringAgg, nextLot, history] = await Promise.all([
    db.loyaltyLedger.aggregate({
      where: { userId, type: "EARN", remaining: { gt: 0 }, expiresAt: { gt: now, lte: soonWindow } },
      _sum: { remaining: true },
    }),
    db.loyaltyLedger.findFirst({
      where: { userId, type: "EARN", remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" }, select: { expiresAt: true, remaining: true },
    }),
    db.loyaltyLedger.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: 40,
      select: { id: true, type: true, kind: true, points: true, balanceAfter: true, description: true, expiresAt: true, createdAt: true },
    }),
  ]);

  return {
    enabled: cfg.enabled,
    points: { available, lifetimeEarned, lifetimeRedeemed },
    tier: { key: tier.key, name: tier.name, min: tier.min, benefits: tier.benefits },
    allTiers: cfg.tiers,
    nextTier: up ? { key: up.tier.key, name: up.tier.name, min: up.tier.min, pointsAway: up.pointsAway, progressPct } : null,
    redemption: {
      pointsPerRupee: cfg.redeemPointsPerRupee,
      minRedeemPoints: cfg.minRedeemPoints,
      redeemablePaise: Math.floor(available / cfg.redeemPointsPerRupee) * 100,
    },
    expiring: {
      within30Days: expiringAgg._sum.remaining ?? 0,
      nextExpiryAt: nextLot?.expiresAt ? nextLot.expiresAt.toISOString() : null,
      nextExpiryPoints: nextLot?.remaining ?? 0,
    },
    earnRules: {
      pointsPerHundred: cfg.pointsPerHundred, registration: cfg.earnRegistration, profile: cfg.earnProfile,
      subscribe30: cfg.earnSubscribe30, subscribe90: cfg.earnSubscribe90, referral: cfg.earnReferral,
      bottleReturn: cfg.earnBottleReturn, renewal: cfg.earnRenewal, streak12: cfg.earnStreak12,
      birthday: cfg.earnBirthday, anniversary: cfg.earnAnniversary, puzzlePlay: cfg.earnPuzzlePlay,
      puzzleWin: cfg.earnPuzzleWin, review: cfg.earnReview,
    },
    campaign: cfg.campaignMultiplier > 1 && cfg.campaignEndsAt && new Date(cfg.campaignEndsAt) > now
      ? { multiplier: cfg.campaignMultiplier, endsAt: cfg.campaignEndsAt } : null,
    hasDob: !!user?.dob,
    history: history.map((h) => ({ ...h, expiresAt: h.expiresAt ? h.expiresAt.toISOString() : null, createdAt: h.createdAt.toISOString() })),
  };
}

// ---------- cron: expiry + reminders ----------

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/** Expire every lot whose expiresAt has passed and still has points left (FIFO, idempotent). */
export async function expireDueLots(now = new Date()) {
  const due = await db.loyaltyLedger.findMany({
    where: { type: "EARN", remaining: { gt: 0 }, expiresAt: { lte: now } },
    select: { id: true, userId: true }, take: 5000,
  });
  let expiredLots = 0, expiredPoints = 0;
  for (const lot of due) {
    try {
      const n = await withRetry(() => db.$transaction(async (tx) => {
        const fresh = await tx.loyaltyLedger.findUnique({ where: { id: lot.id }, select: { remaining: true, expiresAt: true, userId: true } });
        if (!fresh || fresh.remaining <= 0 || !fresh.expiresAt || fresh.expiresAt > now) return 0;
        const amt = fresh.remaining;
        await tx.loyaltyLedger.update({ where: { id: lot.id }, data: { remaining: 0 } });
        const u = await tx.user.update({ where: { id: fresh.userId }, data: { loyaltyPoints: { decrement: amt } }, select: { loyaltyPoints: true } });
        await tx.loyaltyLedger.create({
          data: {
            userId: fresh.userId, type: "EXPIRE", kind: "expiry", points: amt, remaining: 0, balanceAfter: u.loyaltyPoints,
            reference: `expire:${lot.id}`, description: `${amt} points expired`,
          },
        });
        return amt;
      }, TX));
      if (n > 0) { expiredLots++; expiredPoints += n; }
    } catch (e) {
      log.error("loyalty.expire", (e as Error)?.message ?? "failed", { lotId: lot.id });
    }
  }
  return { expiredLots, expiredPoints };
}

/** Send 30/7-day expiry reminders (one per user per remind-day, opt-ins respected). */
export async function sendExpiryReminders(now = new Date()) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { reminded: 0 };
  let reminded = 0;
  for (const days of cfg.remindDays) {
    const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const rows = await db.loyaltyLedger.groupBy({
      by: ["userId"],
      where: { type: "EARN", remaining: { gt: 0 }, expiresAt: { gte: startOfDay(target), lte: endOfDay(target) } },
      _sum: { remaining: true },
    });
    for (const r of rows) {
      const pts = r._sum.remaining ?? 0;
      if (pts <= 0) continue;
      try {
        await notify(r.userId, {
          title: `${pts} DOODLY Points expiring in ${days} days`,
          body: `You have ${pts} points set to expire soon. Redeem them for wallet credit on your Rewards page before they're gone.`,
          email: true,
          emailSubject: `Your DOODLY Points are expiring in ${days} days`,
        });
        reminded++;
      } catch { /* notify never throws, but stay safe */ }
    }
  }
  return { reminded };
}

// ---------- admin ----------

/** Manual points adjustment (+/-). Positive = grant a lot; negative = deduct (FIFO). */
export async function adminAdjust(p: { userId: string; points: number; reason: string; createdById?: string }): Promise<AwardResult | RedeemResult> {
  const points = Math.round(Number(p.points) || 0);
  if (points === 0) return { awarded: false, reason: "zero" };
  if (points > 0) {
    return awardPoints({
      userId: p.userId, kind: "admin_adjust", reference: `adjust:${p.userId}:${generateReference()}`,
      points, description: p.reason || "Manual adjustment", createdById: p.createdById,
    });
  }
  // negative: deduct from available (FIFO), no wallet credit
  const amt = -points;
  try {
    return await withRetry(() => db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: p.userId }, select: { loyaltyPoints: true } });
      const available = user?.loyaltyPoints ?? 0;
      const take = Math.min(amt, available);
      if (take <= 0) return { ok: false as const, reason: "insufficient", detail: { available } };
      const lots = await tx.loyaltyLedger.findMany({
        where: { userId: p.userId, type: "EARN", remaining: { gt: 0 } },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], select: { id: true, remaining: true },
      });
      let need = take;
      for (const lot of lots) { if (need <= 0) break; const t = Math.min(lot.remaining, need); await tx.loyaltyLedger.update({ where: { id: lot.id }, data: { remaining: { decrement: t } } }); need -= t; }
      const u = await tx.user.update({ where: { id: p.userId }, data: { loyaltyPoints: { decrement: take } }, select: { loyaltyPoints: true } });
      await tx.loyaltyLedger.create({
        data: { userId: p.userId, type: "ADJUST", kind: "admin_adjust", points: take, remaining: 0, balanceAfter: u.loyaltyPoints, reference: `adjust:${p.userId}:${generateReference()}`, description: p.reason || "Manual deduction", createdById: p.createdById },
      });
      return { ok: true as const, points: take, creditedPaise: 0, pointsBalance: u.loyaltyPoints, walletBalancePaise: 0 };
    }, TX));
  } catch (e) {
    log.error("loyalty.adminAdjust", (e as Error)?.message ?? "failed", { userId: p.userId });
    return { ok: false, reason: "error" };
  }
}

/** Members enrolled in the programme (any points activity or balance), tier-tagged. */
export async function listMembers(args: { q?: string; limit?: number } = {}) {
  const where: Prisma.UserWhereInput = { role: "CUSTOMER", OR: [{ loyaltyLifetimeEarned: { gt: 0 } }, { loyaltyPoints: { gt: 0 } }] };
  if (args.q?.trim()) {
    const q = args.q.trim();
    where.AND = [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] }];
  }
  const cfg = await getLoyaltyConfig();
  const users = await db.user.findMany({
    where, orderBy: { loyaltyLifetimeEarned: "desc" }, take: args.limit ?? 300,
    select: { id: true, name: true, phone: true, email: true, loyaltyPoints: true, loyaltyLifetimeEarned: true, loyaltyLifetimeRedeemed: true, createdAt: true },
  });
  return users.map((u) => {
    const t = tierFor(u.loyaltyLifetimeEarned, cfg.tiers);
    return { ...u, createdAt: u.createdAt.toISOString(), tier: t.name, tierKey: t.key };
  });
}

/** Programme-wide KPIs for the admin dashboard. */
export async function loyaltyReports() {
  const cfg = await getLoyaltyConfig();
  const [earnedAgg, redeemedAgg, outstandingAgg, expiredAgg, members, byTierRaw] = await Promise.all([
    db.loyaltyLedger.aggregate({ where: { type: "EARN" }, _sum: { points: true } }),
    db.loyaltyLedger.aggregate({ where: { type: "REDEEM" }, _sum: { points: true } }),
    db.user.aggregate({ _sum: { loyaltyPoints: true } }),
    db.loyaltyLedger.aggregate({ where: { type: "EXPIRE" }, _sum: { points: true } }),
    db.user.count({ where: { role: "CUSTOMER", loyaltyLifetimeEarned: { gt: 0 } } }),
    db.user.findMany({ where: { role: "CUSTOMER", loyaltyLifetimeEarned: { gt: 0 } }, select: { loyaltyLifetimeEarned: true } }),
  ]);
  const tierCounts: Record<string, number> = {};
  for (const t of cfg.tiers) tierCounts[t.name] = 0;
  for (const u of byTierRaw) { const t = tierFor(u.loyaltyLifetimeEarned, cfg.tiers); tierCounts[t.name] = (tierCounts[t.name] ?? 0) + 1; }
  const redeemed = redeemedAgg._sum.points ?? 0;
  return {
    enabled: cfg.enabled,
    members,
    pointsEarned: earnedAgg._sum.points ?? 0,
    pointsRedeemed: redeemed,
    pointsOutstanding: outstandingAgg._sum.loyaltyPoints ?? 0,
    pointsExpired: expiredAgg._sum.points ?? 0,
    redeemedValuePaise: Math.round((redeemed / cfg.redeemPointsPerRupee) * 100),
    tierCounts,
  };
}
