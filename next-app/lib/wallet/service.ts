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

// ---------- Trial Pack cashback (the business rule) ----------

/**
 * Credit the ₹200 Trial Pack cashback if the customer is eligible. Safe to call
 * after every successful eligible-plan payment — it is idempotent.
 */
export async function creditTrialCashback(args: { userId: string; subscriptionId?: string; targetPlanSlug?: string } & Actor) {
  const { userId, subscriptionId, actorId } = args;
  return withRetry(() =>
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

export async function adminCredit(args: { userId: string; amountPaise: number; reason: string } & Actor) {
  if (args.amountPaise <= 0) throw new Error("Amount must be positive");
  return db.$transaction((tx) => postTxn(tx, { userId: args.userId, type: "CREDIT", kind: "adjustment", amountPaise: args.amountPaise, reason: args.reason || "manual_credit", description: args.reason, createdById: args.actorId }), TX);
}

export async function adminDebit(args: { userId: string; amountPaise: number; reason: string } & Actor) {
  if (args.amountPaise <= 0) throw new Error("Amount must be positive");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: args.userId }, select: { walletPaise: true } });
    if ((user?.walletPaise ?? 0) < args.amountPaise) throw new Error("Insufficient wallet balance");
    return postTxn(tx, { userId: args.userId, type: "DEBIT", kind: "adjustment", amountPaise: args.amountPaise, reason: args.reason || "manual_debit", description: args.reason, createdById: args.actorId });
  }, TX);
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

export async function listWallets(args: { q?: string; limit?: number } = {}) {
  const where: Prisma.UserWhereInput = { walletPaise: { gt: 0 } };
  if (args.q?.trim()) {
    const q = args.q.trim();
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }];
  }
  return db.user.findMany({ where, orderBy: { walletPaise: "desc" }, take: args.limit ?? 200, select: { id: true, name: true, phone: true, email: true, walletPaise: true, _count: { select: { walletTxns: true } } } });
}

export async function walletReports(args: { from?: Date | string; to?: Date | string } = {}) {
  const range: Prisma.DateTimeFilter = {};
  if (args.from) range.gte = new Date(args.from);
  if (args.to) range.lte = new Date(args.to);
  const where: Prisma.WalletTxnWhereInput = args.from || args.to ? { createdAt: range } : {};

  const [byKind, outstanding, trialAgg] = await Promise.all([
    db.walletTxn.groupBy({ by: ["kind", "type"], where, _sum: { amountPaise: true }, _count: true }),
    db.user.aggregate({ _sum: { walletPaise: true } }),
    db.trialCashback.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
  ]);
  const sum = (kind: string, type: "CREDIT" | "DEBIT") => byKind.filter((g) => g.kind === kind && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const totalCredited = byKind.filter((g) => g.type === "CREDIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const totalPaidTrials = await db.order.count({ where: { type: "SAMPLE", status: "PAID" } });

  return {
    totalCashbackIssuedPaise: sum("cashback", "CREDIT"),
    trialCashbackRedeemed: trialAgg._count,
    trialCashbackRedeemedPaise: trialAgg._sum.amountPaise ?? 0,
    walletUsedPaise: byKind.filter((g) => g.type === "DEBIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0),
    outstandingBalancePaise: outstanding._sum.walletPaise ?? 0,
    totalCreditedPaise: totalCredited,
    // % of paid trials that converted into a cashback (i.e. upgraded to p30/p90).
    cashbackConversionRate: totalPaidTrials ? Math.round((trialAgg._count / totalPaidTrials) * 1000) / 10 : 0,
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
