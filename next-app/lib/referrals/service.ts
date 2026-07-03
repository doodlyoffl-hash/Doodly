/* =============================================================
   DOODLY Growth → Referrals — admin service.
   The referral RELATIONSHIP is User.referredById; the CODE is
   User.referralCode; the REWARD is the ReferralReward idempotency
   ledger + a WalletTxn (kind "referral"). This service derives
   dashboard analytics, a referral-record ledger, detail views, and
   the admin lifecycle actions — reusing Wallet (creditReferralReward,
   reverseTxn), Subscriptions, Orders and the central AuditLog.
   No duplicate referral tables — only ReferralConfig (settings) is new.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { creditReferralReward, reverseTxn } from "@/lib/wallet/service";

interface Actor { actorId?: string; actorRole?: string }

const DEFAULTS = { enabled: true, rewardAmountPaise: 10000, minPlanDays: 30, maxPerReferrer: null as number | null };

export async function getReferralConfig() {
  const c = await db.referralConfig.findUnique({ where: { id: "default" } });
  return c ?? { id: "default", ...DEFAULTS, updatedAt: new Date() };
}
export async function setReferralConfig(args: { enabled?: boolean; rewardAmountPaise?: number; minPlanDays?: number; maxPerReferrer?: number | null }) {
  const data: Record<string, unknown> = {};
  if (args.enabled !== undefined) data.enabled = args.enabled;
  if (args.rewardAmountPaise !== undefined) data.rewardAmountPaise = Math.max(0, Math.round(args.rewardAmountPaise));
  if (args.minPlanDays !== undefined) data.minPlanDays = Math.max(1, Math.round(args.minPlanDays));
  if (args.maxPerReferrer !== undefined) data.maxPerReferrer = args.maxPerReferrer;
  return db.referralConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: args.enabled ?? true, rewardAmountPaise: args.rewardAmountPaise ?? DEFAULTS.rewardAmountPaise, minPlanDays: args.minPlanDays ?? DEFAULTS.minPlanDays, maxPerReferrer: args.maxPerReferrer ?? null },
    update: data,
  });
}

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mLbl = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
function bucketMonthly(rows: Date[], months: number, now = new Date()) {
  const keys: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: mLbl(d) }); }
  const map: Record<string, number> = {}; keys.forEach((k) => (map[k.key] = 0));
  for (const r of rows) { const k = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}`; if (k in map) map[k]++; }
  return keys.map((k) => ({ label: k.label, v: map[k.key] }));
}

const code10 = (rc: string) => (rc || "").slice(0, 10).toUpperCase();

/** Build enriched referral records (one per referred customer). Derives status from
 *  the reward ledger + the referee's eligible subscription. Returns the full set
 *  (status filtering + pagination happen in the caller, since status is derived). */
async function buildRecords(where: import("@prisma/client").Prisma.UserWhereInput, minPlanDays: number, limit = 1000) {
  const referees = await db.user.findMany({
    where: { ...where, referredById: { not: null } },
    orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, name: true, phone: true, createdAt: true, referredById: true, referredBy: { select: { id: true, name: true, referralCode: true, phone: true } } },
  });
  const ids = referees.map((r) => r.id);
  if (!ids.length) return [];
  const [rewards, eligSubs, firstOrders, paidSums] = await Promise.all([
    db.referralReward.findMany({ where: { refereeId: { in: ids } } }),
    db.subscription.findMany({ where: { userId: { in: ids }, plan: { days: { gte: minPlanDays } }, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { userId: true, createdAt: true, plan: { select: { name: true, days: true, slug: true } } } }),
    db.order.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _min: { createdAt: true } }),
    db.order.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: "PAID" }, _sum: { totalPaise: true } }),
  ]);
  const rewardBy = new Map(rewards.map((r) => [r.refereeId, r]));
  const subBy = new Map<string, (typeof eligSubs)[number]>(); eligSubs.forEach((s) => { if (!subBy.has(s.userId)) subBy.set(s.userId, s); });
  const firstBy = new Map((firstOrders as never as { userId: string; _min: { createdAt: Date | null } }[]).map((o) => [o.userId, o._min.createdAt]));
  const paidBy = new Map((paidSums as never as { userId: string; _sum: { totalPaise: number | null } }[]).map((o) => [o.userId, o._sum.totalPaise ?? 0]));

  return referees.map((u) => {
    const reward = rewardBy.get(u.id);
    const sub = subBy.get(u.id);
    const eligible = !!sub;
    let status: string;
    if (reward?.status === "CREDITED") status = "credited";
    else if (reward?.status === "VOID") status = "rejected";
    else if (eligible) status = "eligible";           // eligible purchase, reward not yet issued
    else status = "registered";                        // signed up via a code, no eligible plan yet
    return {
      id: "REF-" + u.id.slice(-8).toUpperCase(),
      refereeId: u.id,
      code: code10(u.referredBy?.referralCode ?? ""),
      referrerId: u.referredById,
      referrerName: u.referredBy?.name ?? "—",
      referrerPhone: u.referredBy?.phone ?? "",
      refereeName: u.name ?? "New customer",
      refereePhone: u.phone ?? "",
      signupAt: u.createdAt,
      firstOrderAt: firstBy.get(u.id) ?? null,
      eligiblePlan: sub ? sub.plan.name : null,
      eligiblePlanSlug: sub ? sub.plan.slug : null,
      revenuePaise: paidBy.get(u.id) ?? 0,
      rewardAmountPaise: reward?.amountPaise ?? 0,
      walletCredited: reward?.status === "CREDITED",
      walletTxnId: reward?.walletTxnId ?? null,
      status,
      rewardStatus: reward?.status ?? null,
      createdAt: reward?.createdAt ?? u.createdAt,
    };
  });
}

export type ReferralRecord = Awaited<ReturnType<typeof buildRecords>>[number];

// ---------------------------------------------------------------- dashboard
export async function referralDashboard(rangeIn: { from?: string | Date; to?: string | Date } = {}) {
  const now = new Date();
  const cfg = await getReferralConfig();
  const to = rangeIn.to ? eoD(new Date(rangeIn.to)) : now;
  const from = rangeIn.from ? soD(new Date(rangeIn.from)) : soD(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const sixMoAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [totalCustomers, referrers, allReferees, rewardAgg, refereesSince] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.groupBy({ by: ["referredById"], where: { referredById: { not: null } }, _count: { _all: true } }),
    db.user.count({ where: { referredById: { not: null } } }),
    db.referralReward.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.user.findMany({ where: { referredById: { not: null }, createdAt: { gte: sixMoAgo } }, select: { createdAt: true } }),
  ]);

  const records = await buildRecords({}, cfg.minPlanDays, 2000);
  const successful = records.filter((r) => r.status === "credited").length;
  const eligiblePending = records.filter((r) => r.status === "eligible").length;
  const pending = records.filter((r) => r.status === "registered" || r.status === "eligible").length;
  const rejected = records.filter((r) => r.status === "rejected").length;
  const referralRevenue = records.filter((r) => r.status === "credited").reduce((s, r) => s + r.revenuePaise, 0);
  const rewardsPaise = rewardAgg._sum.amountPaise ?? 0;

  // top referrers
  const byReferrer = new Map<string, { referrerId: string; name: string; code: string; total: number; credited: number; earnedPaise: number }>();
  records.forEach((r) => {
    if (!r.referrerId) return;
    const cur = byReferrer.get(r.referrerId) ?? { referrerId: r.referrerId, name: r.referrerName, code: r.code, total: 0, credited: 0, earnedPaise: 0 };
    cur.total++; if (r.status === "credited") { cur.credited++; cur.earnedPaise += r.rewardAmountPaise; }
    byReferrer.set(r.referrerId, cur);
  });
  const topReferrers = [...byReferrer.values()].sort((a, b) => b.earnedPaise - a.earnedPaise || b.credited - a.credited).slice(0, 10);

  return {
    meta: { from: dKey(from), to: dKey(to), generatedAt: now.toISOString(), config: { enabled: cfg.enabled, rewardAmountPaise: cfg.rewardAmountPaise, minPlanDays: cfg.minPlanDays } },
    kpis: {
      totalReferralCodes: totalCustomers,
      activeReferrers: referrers.length,
      invitationsSent: allReferees,
      successfulReferrals: successful,
      pendingReferrals: pending,
      eligiblePendingReward: eligiblePending,
      rejectedReferrals: rejected,
      conversionRate: allReferees ? Math.round((successful / allReferees) * 1000) / 10 : 0,
      walletRewardsIssuedPaise: rewardsPaise,
      walletRewardsIssuedCount: rewardAgg._count,
      referralRevenuePaise: referralRevenue,
      avgRewardPerCustomerPaise: rewardAgg._count ? Math.round(rewardsPaise / rewardAgg._count) : 0,
    },
    charts: { growthTrend: bucketMonthly(refereesSince.map((r) => r.createdAt), 6, now) },
    topReferrers,
  };
}

// ---------------------------------------------------------------- records ledger
export interface ReferralFilters { q?: string; status?: string; planSlug?: string; from?: string | Date; to?: string | Date; sort?: string; page?: number; pageSize?: number }

export async function listReferralRecords(f: ReferralFilters = {}) {
  const cfg = await getReferralConfig();
  const where: import("@prisma/client").Prisma.UserWhereInput = {};
  if (f.from || f.to) { const r: { gte?: Date; lte?: Date } = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } },
      { referredBy: { name: { contains: q, mode: "insensitive" } } },
      { referredBy: { referralCode: { contains: q, mode: "insensitive" } } },
    ];
  }
  let records = await buildRecords(where, cfg.minPlanDays, 2000);
  if (f.status) records = records.filter((r) => r.status === f.status);
  if (f.planSlug) records = records.filter((r) => r.eligiblePlanSlug === f.planSlug);
  const sort = f.sort ?? "latest";
  records.sort((a, b) =>
    sort === "reward" ? b.rewardAmountPaise - a.rewardAmountPaise
    : sort === "customer" ? String(a.refereeName).localeCompare(String(b.refereeName))
    : sort === "revenue" ? b.revenuePaise - a.revenuePaise
    : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = records.length;
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  return { records: records.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function referralDetail(refereeId: string) {
  const cfg = await getReferralConfig();
  const [recs, reward, subs, orders] = await Promise.all([
    buildRecords({ id: refereeId }, cfg.minPlanDays, 1),
    db.referralReward.findUnique({ where: { refereeId } }),
    db.subscription.findMany({ where: { userId: refereeId }, select: { id: true, status: true, startDate: true, plan: { select: { name: true, days: true, slug: true } } }, orderBy: { startDate: "desc" }, take: 10 }),
    db.order.findMany({ where: { userId: refereeId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, status: true, totalPaise: true, createdAt: true } }),
  ]);
  const rec = recs[0];
  if (!rec) throw new Error("Referral not found");
  const walletTxn = reward?.walletTxnId ? await db.walletTxn.findUnique({ where: { id: reward.walletTxnId } }) : null;
  return { ...rec, reward, subscriptions: subs, orders, walletTxn };
}

// ---------------------------------------------------------------- lifecycle actions
/** Check eligibility + issue the ₹100 reward (idempotent, reuses the Wallet ledger). */
export async function processReferralReward(refereeId: string, actor: Actor) {
  const cfg = await getReferralConfig();
  if (!cfg.enabled) throw new Error("The referral programme is currently disabled.");
  const referee = await db.user.findUnique({ where: { id: refereeId }, select: { referredById: true } });
  if (!referee?.referredById) throw new Error("This customer was not referred by anyone.");
  const existing = await db.referralReward.findUnique({ where: { refereeId } });
  if (existing?.status === "CREDITED") return { credited: false, reason: "already_rewarded" as const };
  if (existing?.status === "VOID") throw new Error("This referral was rejected and cannot be rewarded.");
  const sub = await db.subscription.findFirst({ where: { userId: refereeId, plan: { days: { gte: cfg.minPlanDays } }, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true } });
  if (!sub) throw new Error(`Not eligible — the referred customer has no paid ${cfg.minPlanDays}-day (or longer) subscription.`);
  return creditReferralReward({ referrerId: referee.referredById, refereeId, amountPaise: cfg.rewardAmountPaise, triggerSubscriptionId: sub.id, actorId: actor.actorId, actorRole: actor.actorRole });
}

/** Reject a referral: void its reward slot (blocks future reward) + reverse any credited wallet txn. */
export async function rejectReferral(refereeId: string, reason: string | undefined, actor: Actor) {
  const referee = await db.user.findUnique({ where: { id: refereeId }, select: { referredById: true } });
  if (!referee?.referredById) throw new Error("Not a referred customer.");
  const existing = await db.referralReward.findUnique({ where: { refereeId } });
  if (existing?.status === "CREDITED" && existing.walletTxnId) {
    await reverseTxn({ txnId: existing.walletTxnId, actorId: actor.actorId, actorRole: actor.actorRole }).catch(() => {});
  }
  await db.referralReward.upsert({
    where: { refereeId },
    create: { referrerId: referee.referredById, refereeId, amountPaise: 0, status: "VOID" },
    update: { status: "VOID" },
  });
  return { ok: true, reason: reason ?? null };
}

/** Reverse an already-credited reward (undo the wallet credit, keep the referral open for review). */
export async function reverseReferralReward(refereeId: string, reason: string | undefined, actor: Actor) {
  const reward = await db.referralReward.findUnique({ where: { refereeId } });
  if (!reward || reward.status !== "CREDITED" || !reward.walletTxnId) throw new Error("No credited reward to reverse.");
  await reverseTxn({ txnId: reward.walletTxnId, actorId: actor.actorId, actorRole: actor.actorRole });
  await db.referralReward.update({ where: { refereeId }, data: { status: "VOID" } });
  return { ok: true, reason: reason ?? null };
}

/** Regenerate a customer's referral code (invalidates the old shareable link). */
export async function regenerateReferralCode(userId: string) {
  const AB = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const rand = Array.from({ length: 8 }, (_, i) => AB[(userId.charCodeAt(i % userId.length) + i * 7) % AB.length]).join("");
  const newCode = `DOODLY${rand}`;
  const user = await db.user.update({ where: { id: userId }, data: { referralCode: newCode }, select: { referralCode: true } });
  return { code: code10(user.referralCode) };
}

/** Bulk-process rewards for many eligible referrals; skips ineligible/already-rewarded. */
export async function bulkProcessReferrals(refereeIds: string[], actor: Actor) {
  let credited = 0; const skipped: string[] = [];
  for (const id of refereeIds) {
    try { const r = await processReferralReward(id, actor); if (r.credited) credited++; else skipped.push(id); }
    catch { skipped.push(id); }
  }
  return { credited, skipped: skipped.length };
}
