/* =============================================================
   DOODLY Wallet — service layer (Prisma).
   Public/customer: getWallet, previewWalletApply, applyWalletAtCheckout.
   System:          creditTrialCashback (idempotent, post-payment).
   Admin:           adminCredit / adminDebit / reverseTxn / listWallets /
                    walletReports / get|setCashbackConfig.

   Idempotency & safety:
     • TrialCashback.userId is UNIQUE → a customer can only ever be credited
       the trial cashback once, even under concurrent payments (DB-enforced).
     • WalletTxn.reference is UNIQUE; every balance change writes balanceAfter.
     • Wallet usage per order is guarded against double-debit.
     • Transactions run Serializable with a small retry on transient conflicts.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  evaluateTrialCashback, computeWalletApply, generateReference,
  DEFAULT_CASHBACK_RULES, type CashbackRules,
} from "./engine";
import { emailIfOptedIn } from "@/lib/notifications/dispatch";
import * as T from "@/lib/email/templates";

interface Actor { actorId?: string; actorRole?: string }

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

type Tx = Prisma.TransactionClient;

export async function getCashbackRules(client: Tx | typeof db = db): Promise<CashbackRules> {
  const cfg = await client.cashbackConfig.findUnique({ where: { id: "default" } });
  if (!cfg) return DEFAULT_CASHBACK_RULES;
  return { enabled: cfg.enabled, amountPaise: cfg.amountPaise, eligiblePlanSlugs: cfg.eligiblePlanSlugs };
}

/** Post a balance change + WalletTxn atomically; returns the new balance. */
async function postTxn(tx: Tx, p: {
  userId: string; type: "CREDIT" | "DEBIT"; kind: string; amountPaise: number;
  reason: string; description?: string; subscriptionId?: string; orderId?: string;
  createdById?: string; reversedTxnId?: string;
}) {
  const user = await tx.user.update({
    where: { id: p.userId },
    data: { walletPaise: p.type === "CREDIT" ? { increment: p.amountPaise } : { decrement: p.amountPaise } },
    select: { walletPaise: true },
  });
  const balanceAfterPaise = user.walletPaise;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const txn = await tx.walletTxn.create({
        data: {
          userId: p.userId, type: p.type, kind: p.kind, amountPaise: p.amountPaise, balanceAfterPaise,
          reference: generateReference(), description: p.description, reason: p.reason,
          subscriptionId: p.subscriptionId, orderId: p.orderId, createdById: p.createdById, reversedTxnId: p.reversedTxnId,
        },
      });
      return { txn, balancePaise: balanceAfterPaise };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target).includes("reference")) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a unique wallet reference.");
}

async function notifyUser(tx: Tx, userId: string, title: string, body: string) {
  await tx.notification.create({ data: { userId, channel: "PUSH", title, body, sentAt: new Date() } });
}

// ---------- wallet recharge / "Add Money" ----------

const RECHARGE_KEY = "wallet.recharge";
export type RechargeConfig = { enabled: boolean; minPaise: number; maxPaise: number; presetsPaise: number[] };
const DEFAULT_RECHARGE: RechargeConfig = { enabled: true, minPaise: 10000, maxPaise: 10000000, presetsPaise: [10000, 25000, 50000, 100000, 200000, 500000] };

export async function getRechargeConfig(): Promise<RechargeConfig> {
  try {
    const s = await db.appSetting.findUnique({ where: { key: RECHARGE_KEY } });
    return s ? { ...DEFAULT_RECHARGE, ...(s.value as Partial<RechargeConfig>) } : DEFAULT_RECHARGE;
  } catch { return DEFAULT_RECHARGE; }
}
export async function setRechargeConfig(patch: Partial<RechargeConfig>) {
  const next = { ...(await getRechargeConfig()), ...patch };
  await db.appSetting.upsert({ where: { key: RECHARGE_KEY }, create: { key: RECHARGE_KEY, value: next as object }, update: { value: next as object } });
  return next;
}

/**
 * Credit a wallet top-up after a successful gateway payment. Idempotent on the
 * caller-supplied `reference` (the gateway/payment id) — a repeated call with the
 * same reference returns the original credit instead of double-crediting.
 * Validates the amount against the admin recharge config; runs Serializable.
 */
export async function rechargeWallet(args: { userId: string; amountPaise: number; reference?: string; method?: string } & Actor) {
  const amt = Math.round(args.amountPaise);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false as const, reason: "invalid_amount" };
  const cfg = await getRechargeConfig();
  if (!cfg.enabled) return { ok: false as const, reason: "disabled" };
  if (amt < cfg.minPaise) return { ok: false as const, reason: "below_min", minPaise: cfg.minPaise };
  if (amt > cfg.maxPaise) return { ok: false as const, reason: "above_max", maxPaise: cfg.maxPaise };

  if (args.reference) {
    const existing = await db.walletTxn.findUnique({ where: { reference: args.reference } });
    if (existing) return { ok: true as const, idempotent: true, balancePaise: existing.balanceAfterPaise, txnId: existing.id, reference: existing.reference };
  }
  return withRetry(() => db.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: args.userId }, data: { walletPaise: { increment: amt } }, select: { walletPaise: true } });
    try {
      const txn = await tx.walletTxn.create({
        data: { userId: args.userId, type: "CREDIT", kind: "topup", amountPaise: amt, balanceAfterPaise: user.walletPaise, reference: args.reference || generateReference(), description: `Wallet recharge${args.method ? " (" + args.method + ")" : ""}`, reason: "recharge", createdById: args.actorId ?? null },
      });
      return { ok: true as const, idempotent: false, balancePaise: user.walletPaise, txnId: txn.id, reference: txn.reference };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && args.reference) {
        const ex = await db.walletTxn.findUnique({ where: { reference: args.reference } });
        if (ex) return { ok: true as const, idempotent: true, balancePaise: ex.balanceAfterPaise, txnId: ex.id, reference: ex.reference };
      }
      throw e;
    }
  }, TX));
}

// ---------- Trial Pack cashback (the business rule) ----------

/**
 * Credit the ₹200 Trial Pack cashback if the customer is eligible. Safe to call
 * after every successful eligible-plan payment — it is idempotent.
 */
export async function creditTrialCashback(args: { userId: string; subscriptionId?: string; targetPlanSlug?: string } & Actor) {
  const { userId, subscriptionId, actorId } = args;
  const result = await withRetry(() =>
    db.$transaction(async (tx) => {
      const rules = await getCashbackRules(tx);

      const existing = await tx.trialCashback.findUnique({ where: { userId } });
      const alreadyCredited = existing?.status === "CREDITED";

      // Resolve the trial facts: a SAMPLE order that is PAID (completed) / REFUNDED.
      const [paidTrial, refundedTrial] = await Promise.all([
        tx.order.findFirst({ where: { userId, type: "SAMPLE", status: "PAID" }, select: { id: true } }),
        tx.order.findFirst({ where: { userId, type: "SAMPLE", status: "REFUNDED" }, select: { id: true } }),
      ]);

      // Resolve the plan being purchased. If not told, find the customer's active
      // subscription on an eligible plan (so the post-payment trigger needs only userId).
      let targetPlanSlug = args.targetPlanSlug;
      let resolvedSubId = subscriptionId;
      if (!targetPlanSlug) {
        if (resolvedSubId) {
          const sub = await tx.subscription.findUnique({ where: { id: resolvedSubId }, select: { plan: { select: { slug: true } } } });
          targetPlanSlug = sub?.plan.slug;
        } else {
          const sub = await tx.subscription.findFirst({
            where: { userId, status: "ACTIVE", plan: { slug: { in: rules.eligiblePlanSlugs } } },
            select: { id: true, plan: { select: { slug: true } } },
          });
          if (sub) { targetPlanSlug = sub.plan.slug; resolvedSubId = sub.id; }
        }
      }

      const decision = evaluateTrialCashback({
        rules,
        hasCompletedPaidTrial: !!paidTrial,
        trialRefunded: !!refundedTrial,
        targetPlanSlug: targetPlanSlug ?? "",
        alreadyCredited,
      });
      if (!decision.eligible) return { credited: false, reason: decision.reason };

      // Claim the once-per-customer slot first (UNIQUE userId = race-safe idempotency).
      try {
        await tx.trialCashback.create({
          data: { userId, trialOrderId: paidTrial?.id, subscriptionId: resolvedSubId, amountPaise: decision.amountPaise, status: "CREDITED" },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { credited: false, reason: "already_credited" as const };
        throw e;
      }

      const { txn, balancePaise } = await postTxn(tx, {
        userId, type: "CREDIT", kind: "cashback", amountPaise: decision.amountPaise,
        reason: "trial_cashback", description: "Trial Pack cashback", subscriptionId: resolvedSubId,
      });
      await tx.trialCashback.update({ where: { userId }, data: { walletTxnId: txn.id } });
      await notifyUser(tx, userId, "₹200 added to your DOODLY Wallet!", "Your Trial Pack cashback has been credited. Use it on your next order or renewal.");

      return { credited: true, amountPaise: decision.amountPaise, balancePaise, reference: txn.reference };
    }, TX),
  );
  // Branded "wallet credit" email (opt-in respected) once the ₹200 cashback is credited.
  if (result?.credited) {
    const amt = "₹" + Math.round(((result as { amountPaise?: number }).amountPaise || 0) / 100);
    await emailIfOptedIn(userId, (name) => T.walletCredit({ name, amount: amt, reason: "Trial Pack cashback" }));
  }
  return result;
}

// ---------- Customer wallet ----------

export async function getWallet(args: { userId: string; limit?: number }) {
  const [user, transactions, byKind] = await Promise.all([
    db.user.findUnique({ where: { id: args.userId }, select: { walletPaise: true } }),
    db.walletTxn.findMany({
      where: { userId: args.userId }, orderBy: { createdAt: "desc" }, take: args.limit ?? 100,
      select: { id: true, type: true, kind: true, amountPaise: true, balanceAfterPaise: true, reference: true, description: true, createdAt: true },
    }),
    db.walletTxn.groupBy({ by: ["kind", "type"], where: { userId: args.userId }, _sum: { amountPaise: true } }),
  ]);
  const sum = (kind: string, type: "CREDIT" | "DEBIT") =>
    byKind.filter((g) => g.kind === kind && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  return {
    balancePaise: user?.walletPaise ?? 0,
    transactions,
    summary: {
      cashbackEarnedPaise: sum("cashback", "CREDIT"),
      referralRewardsPaise: sum("referral", "CREDIT"),
      promoCreditsPaise: sum("promo", "CREDIT"),
      usedPaise: byKind.filter((g) => g.type === "DEBIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0),
    },
  };
}

/** Preview how much wallet can be applied to an order total (no mutation). */
export async function previewWalletApply(args: { userId: string; orderTotalPaise: number; requestedPaise?: number }) {
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { walletPaise: true } });
  const balancePaise = user?.walletPaise ?? 0;
  return { balancePaise, ...computeWalletApply(balancePaise, args.orderTotalPaise, args.requestedPaise) };
}

/** Apply (debit) wallet balance to an order at checkout. Idempotent per order. */
export async function applyWalletAtCheckout(args: { userId: string; orderId: string; amountPaise: number } & Actor) {
  const { userId, orderId, amountPaise } = args;
  if (amountPaise <= 0) return { appliedPaise: 0 };
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const dup = await tx.walletTxn.findFirst({ where: { orderId, kind: "usage" }, select: { amountPaise: true } });
      if (dup) return { appliedPaise: dup.amountPaise, idempotent: true };

      const user = await tx.user.findUnique({ where: { id: userId }, select: { walletPaise: true } });
      const applied = Math.min(amountPaise, user?.walletPaise ?? 0);
      if (applied <= 0) return { appliedPaise: 0 };
      const { balancePaise } = await postTxn(tx, { userId, type: "DEBIT", kind: "usage", amountPaise: applied, reason: "order", description: "Applied to order", orderId });
      return { appliedPaise: applied, balancePaise };
    }, TX),
  );
}

// ---------- Admin ----------

export async function adminCredit(args: { userId: string; amountPaise: number; reason: string; kind?: string } & Actor) {
  if (args.amountPaise <= 0) throw new Error("Amount must be positive");
  return db.$transaction((tx) => postTxn(tx, { userId: args.userId, type: "CREDIT", kind: args.kind ?? "adjustment", amountPaise: args.amountPaise, reason: args.reason || "manual_credit", description: args.reason, createdById: args.actorId }), TX);
}

export async function adminDebit(args: { userId: string; amountPaise: number; reason: string; allowNegative?: boolean } & Actor) {
  if (args.amountPaise <= 0) throw new Error("Amount must be positive");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: args.userId }, select: { walletPaise: true } });
    if (!args.allowNegative && (user?.walletPaise ?? 0) < args.amountPaise) throw new Error("Insufficient wallet balance");
    return postTxn(tx, { userId: args.userId, type: "DEBIT", kind: "adjustment", amountPaise: args.amountPaise, reason: args.reason || "manual_debit", description: args.reason, createdById: args.actorId });
  }, TX);
}

/** Bulk manual credit — reuses adminCredit per user; never throws for one bad id. */
export async function bulkCredit(args: { userIds: string[]; amountPaise: number; reason: string } & Actor) {
  let count = 0; const failed: string[] = [];
  for (const userId of args.userIds) {
    try { await adminCredit({ userId, amountPaise: args.amountPaise, reason: args.reason, actorId: args.actorId, actorRole: args.actorRole }); count++; }
    catch { failed.push(userId); }
  }
  return { count, failed: failed.length };
}

/** Bulk manual debit — skips (does not fail) wallets with insufficient balance. */
export async function bulkDebit(args: { userIds: string[]; amountPaise: number; reason: string } & Actor) {
  let count = 0; const failed: string[] = [];
  for (const userId of args.userIds) {
    try { await adminDebit({ userId, amountPaise: args.amountPaise, reason: args.reason, actorId: args.actorId, actorRole: args.actorRole }); count++; }
    catch { failed.push(userId); }
  }
  return { count, failed: failed.length };
}

// ---------- Referral reward (₹100, once per referred customer) ----------

const DEFAULT_REFERRAL_PAISE = 10000; // ₹100

/**
 * Credit the referral reward to the referrer once the referred customer subscribes.
 * Idempotent — ReferralReward.refereeId is UNIQUE, so a referrer is rewarded at
 * most once per referred customer even under concurrent triggers.
 */
export async function creditReferralReward(args: { referrerId: string; refereeId: string; amountPaise?: number; triggerOrderId?: string; triggerSubscriptionId?: string } & Actor) {
  const amountPaise = args.amountPaise && args.amountPaise > 0 ? args.amountPaise : DEFAULT_REFERRAL_PAISE;
  if (!args.referrerId || !args.refereeId) throw new Error("referrerId and refereeId are required");
  if (args.referrerId === args.refereeId) throw new Error("A customer cannot refer themselves.");
  const result = await withRetry(() =>
    db.$transaction(async (tx) => {
      const existing = await tx.referralReward.findUnique({ where: { refereeId: args.refereeId } });
      if (existing?.status === "CREDITED") return { credited: false, reason: "already_rewarded" as const };
      const referrer = await tx.user.findUnique({ where: { id: args.referrerId }, select: { id: true } });
      if (!referrer) throw new Error("Referrer not found");
      try {
        await tx.referralReward.create({ data: { referrerId: args.referrerId, refereeId: args.refereeId, amountPaise, status: "CREDITED", triggerOrderId: args.triggerOrderId, triggerSubscriptionId: args.triggerSubscriptionId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { credited: false, reason: "already_rewarded" as const };
        throw e;
      }
      const { txn, balancePaise } = await postTxn(tx, { userId: args.referrerId, type: "CREDIT", kind: "referral", amountPaise, reason: "referral", description: "Referral reward — a friend subscribed", subscriptionId: args.triggerSubscriptionId, orderId: args.triggerOrderId, createdById: args.actorId });
      await tx.referralReward.update({ where: { refereeId: args.refereeId }, data: { walletTxnId: txn.id } });
      await notifyUser(tx, args.referrerId, `₹${Math.round(amountPaise / 100)} referral reward added!`, "Thanks for referring a friend to DOODLY — the reward is in your wallet.");
      return { credited: true, amountPaise, balancePaise, reference: txn.reference };
    }, TX),
  );
  // Branded "referral reward" celebration email (opt-in respected) once credited.
  if (result?.credited) {
    const friend = await db.user.findUnique({ where: { id: args.refereeId }, select: { name: true } }).then((u) => u?.name || undefined).catch(() => undefined);
    await emailIfOptedIn(args.referrerId, (name) => T.referralReward({ name, amount: "₹" + Math.round(amountPaise / 100), friend }));
  }
  return result;
}

/** Reverse a previous txn (creates the opposite entry). Guarded against double-reversal. */
export async function reverseTxn(args: { txnId: string } & Actor) {
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const orig = await tx.walletTxn.findUnique({ where: { id: args.txnId } });
      if (!orig) throw new Error("Transaction not found");
      const already = await tx.walletTxn.findUnique({ where: { reversedTxnId: orig.id }, select: { id: true } });
      if (already) throw new Error("Transaction already reversed");
      const opposite = orig.type === "CREDIT" ? "DEBIT" : "CREDIT";
      const res = await postTxn(tx, {
        userId: orig.userId, type: opposite, kind: "reversal", amountPaise: orig.amountPaise,
        reason: "reversal", description: `Reversal of ${orig.reference}`, createdById: args.actorId, reversedTxnId: orig.id,
      });
      // If we reversed a trial cashback, void the ledger so it could be re-evaluated.
      if (orig.kind === "cashback") await tx.trialCashback.updateMany({ where: { walletTxnId: orig.id }, data: { status: "VOID" } });
      return res;
    }, TX),
  );
}

/** Admin wallet list — every customer with a balance OR any wallet history,
 *  enriched with per-wallet credit/debit/cashback/referral totals + trial status. */
export async function listWallets(args: { q?: string; limit?: number } = {}) {
  const where: Prisma.UserWhereInput = { OR: [{ walletPaise: { gt: 0 } }, { walletTxns: { some: {} } }] };
  if (args.q?.trim()) {
    const q = args.q.trim();
    where.AND = [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] }];
  }
  const users = await db.user.findMany({
    where, orderBy: { walletPaise: "desc" }, take: args.limit ?? 300,
    select: { id: true, name: true, phone: true, email: true, walletPaise: true, createdAt: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return [];
  const [byKind, perUser, trials, samples] = await Promise.all([
    db.walletTxn.groupBy({ by: ["userId", "kind", "type"], where: { userId: { in: ids } }, _sum: { amountPaise: true } }),
    db.walletTxn.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true }, _count: true }),
    db.trialCashback.findMany({ where: { userId: { in: ids }, status: "CREDITED" }, select: { userId: true } }),
    db.order.findMany({ where: { userId: { in: ids }, type: "SAMPLE", status: "PAID" }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  const trialSet = new Set(trials.map((t) => t.userId));
  const sampleSet = new Set(samples.map((s) => s.userId));
  const kindSum = (uid: string, kind: string, type: "CREDIT" | "DEBIT") => byKind.filter((g) => g.userId === uid && g.kind === kind && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const typeSum = (uid: string, type: "CREDIT" | "DEBIT") => byKind.filter((g) => g.userId === uid && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  return users.map((u) => {
    const row = perUser.find((p) => p.userId === u.id);
    return {
      id: u.id, name: u.name, phone: u.phone, email: u.email, walletPaise: u.walletPaise, createdAt: u.createdAt,
      txnCount: row?._count ?? 0, lastTxnAt: row?._max.createdAt ?? null,
      creditsPaise: typeSum(u.id, "CREDIT"), debitsPaise: typeSum(u.id, "DEBIT"),
      cashbackPaise: kindSum(u.id, "cashback", "CREDIT"), referralPaise: kindSum(u.id, "referral", "CREDIT"),
      promoPaise: kindSum(u.id, "promo", "CREDIT"), refundPaise: kindSum(u.id, "refund", "CREDIT"),
      usedPaise: kindSum(u.id, "usage", "DEBIT"),
      trialStatus: trialSet.has(u.id) ? "redeemed" : sampleSet.has(u.id) ? "eligible" : "none",
    };
  });
}

/** Admin transaction ledger across all wallets — search/filter/sort + reversed flag. */
export async function listAllTransactions(args: { from?: string | Date; to?: string | Date; kind?: string; type?: "CREDIT" | "DEBIT"; q?: string; userId?: string; limit?: number } = {}) {
  const where: Prisma.WalletTxnWhereInput = {};
  if (args.userId) where.userId = args.userId;
  if (args.kind) where.kind = args.kind;
  if (args.type) where.type = args.type;
  if (args.from || args.to) { const r: Prisma.DateTimeFilter = {}; if (args.from) r.gte = new Date(args.from); if (args.to) r.lte = new Date(args.to); where.createdAt = r; }
  if (args.q?.trim()) {
    const q = args.q.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } },
      { orderId: { contains: q } }, { subscriptionId: { contains: q } },
      { user: { name: { contains: q, mode: "insensitive" } } }, { user: { phone: { contains: q } } },
    ];
  }
  const rows = await db.walletTxn.findMany({
    where, orderBy: { createdAt: "desc" }, take: args.limit ?? 500,
    select: {
      id: true, userId: true, type: true, kind: true, amountPaise: true, balanceAfterPaise: true, reference: true,
      description: true, reason: true, subscriptionId: true, orderId: true, reversedTxnId: true, createdById: true, createdAt: true,
      user: { select: { name: true, phone: true } },
    },
  });
  const reversedIds = new Set(rows.filter((r) => r.reversedTxnId).map((r) => r.reversedTxnId as string));
  return rows.map((r) => ({ ...r, reversed: reversedIds.has(r.id) }));
}

/** Full admin view of one customer's wallet: profile + balance + history + referral + trial. */
export async function walletDetail(userId: string) {
  const [profile, wallet, refInfo, referralsCount, trial] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, email: true, walletPaise: true, createdAt: true } }),
    getWallet({ userId, limit: 300 }),
    db.user.findUnique({ where: { id: userId }, select: { referredBy: { select: { id: true, name: true } } } }),
    db.user.count({ where: { referredById: userId } }),
    db.trialCashback.findUnique({ where: { userId }, select: { status: true, amountPaise: true, creditedAt: true } }),
  ]);
  if (!profile) throw new Error("Wallet not found");
  return { user: profile, ...wallet, referral: { referredBy: refInfo?.referredBy ?? null, referralsCount }, trial };
}

export async function walletReports(args: { from?: Date | string; to?: Date | string } = {}) {
  const range: Prisma.DateTimeFilter = {};
  if (args.from) range.gte = new Date(args.from);
  if (args.to) range.lte = new Date(args.to);
  const where: Prisma.WalletTxnWhereInput = args.from || args.to ? { createdAt: range } : {};

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [byKind, outstanding, trialAgg, activeWallets, todayByType, referralAgg] = await Promise.all([
    db.walletTxn.groupBy({ by: ["kind", "type"], where, _sum: { amountPaise: true }, _count: true }),
    db.user.aggregate({ _sum: { walletPaise: true } }),
    db.trialCashback.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.user.count({ where: { walletPaise: { gt: 0 } } }),
    db.walletTxn.groupBy({ by: ["type"], where: { createdAt: { gte: todayStart } }, _sum: { amountPaise: true } }),
    db.referralReward.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
  ]);
  const sum = (kind: string, type: "CREDIT" | "DEBIT") => byKind.filter((g) => g.kind === kind && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const totalCredited = byKind.filter((g) => g.type === "CREDIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const totalPaidTrials = await db.order.count({ where: { type: "SAMPLE", status: "PAID" } });
  const today = (t: "CREDIT" | "DEBIT") => todayByType.find((g) => g.type === t)?._sum.amountPaise ?? 0;

  return {
    // range-aware totals (respect ?from/?to)
    totalCashbackIssuedPaise: sum("cashback", "CREDIT"),
    trialCashbackRedeemed: trialAgg._count,
    trialCashbackRedeemedPaise: trialAgg._sum.amountPaise ?? 0,
    referralRewardsIssuedPaise: sum("referral", "CREDIT"),
    promoIssuedPaise: sum("promo", "CREDIT"),
    refundCreditsPaise: sum("refund", "CREDIT"),
    adjustmentCreditsPaise: sum("adjustment", "CREDIT"),
    walletUsedPaise: byKind.filter((g) => g.type === "DEBIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0),
    totalCreditedPaise: totalCredited,
    cashbackConversionRate: totalPaidTrials ? Math.round((trialAgg._count / totalPaidTrials) * 1000) / 10 : 0,
    // live dashboard fields (not range-filtered)
    totalBalancePaise: outstanding._sum.walletPaise ?? 0,
    outstandingBalancePaise: outstanding._sum.walletPaise ?? 0,
    activeWallets,
    creditsTodayPaise: today("CREDIT"),
    debitsTodayPaise: today("DEBIT"),
    referralRewardsCount: referralAgg._count,
    referralRewardsAllTimePaise: referralAgg._sum.amountPaise ?? 0,
    pendingAdjustments: 0, // future-ready (no approval queue for wallet adjustments yet)
    expiredCreditsPaise: 0, // future-ready (wallet-credit expiry policy not yet enabled)
  };
}

// ---------- Config (admin-editable rules) ----------

export async function getCashbackConfig() {
  const cfg = await db.cashbackConfig.findUnique({ where: { id: "default" } });
  return cfg ?? { id: "default", enabled: DEFAULT_CASHBACK_RULES.enabled, amountPaise: DEFAULT_CASHBACK_RULES.amountPaise, eligiblePlanSlugs: DEFAULT_CASHBACK_RULES.eligiblePlanSlugs, expiryDays: null };
}

export async function setCashbackConfig(args: { enabled?: boolean; amountPaise?: number; eligiblePlanSlugs?: string[]; expiryDays?: number | null } & Actor) {
  const data: Prisma.CashbackConfigUncheckedUpdateInput = {};
  if (args.enabled !== undefined) data.enabled = args.enabled;
  if (args.amountPaise !== undefined) data.amountPaise = args.amountPaise;
  if (args.eligiblePlanSlugs !== undefined) data.eligiblePlanSlugs = args.eligiblePlanSlugs;
  if (args.expiryDays !== undefined) data.expiryDays = args.expiryDays;
  return db.cashbackConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: args.enabled ?? true, amountPaise: args.amountPaise ?? DEFAULT_CASHBACK_RULES.amountPaise, eligiblePlanSlugs: args.eligiblePlanSlugs ?? DEFAULT_CASHBACK_RULES.eligiblePlanSlugs, expiryDays: args.expiryDays ?? null },
    update: data,
  });
}

export type WalletData = Awaited<ReturnType<typeof getWallet>>;
export type WalletReports = Awaited<ReturnType<typeof walletReports>>;
