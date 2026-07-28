/* =============================================================
   DOODLY — Reward Management (admin)
   Read/manage RewardRedemption records: list w/ filters + status counts,
   full detail (joined subscription/winner/users), manually ISSUE a reward
   (optionally bound to a customer), CANCEL an un-redeemed reward, and RESEND
   the claim reminder. Reuses issueReward + rewardClaimUrl from the core engine.
   All mutations are audited. Nothing is ever hard-deleted.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { Errors } from "@/lib/http";
import { issueReward, rewardClaimUrl } from "@/lib/rewards/service";
import type { ReqContext } from "@/lib/auth/request";

export interface AdminActor { userId?: string | null; role?: string | null; }
const STATUSES = ["ISSUED", "REDEEMED", "EXPIRED", "CANCELLED"] as const;
const mlLabel = (ml: number) => (ml % 1000 === 0 ? `${ml / 1000} L` : `${ml} ml`);
const isPastExpiry = (r: { status: string; expiresAt: Date | null }) =>
  r.status === "ISSUED" && !!r.expiresAt && r.expiresAt.getTime() < Date.now();
/** Status as the customer would see it (lazy expiry), without writing. */
const effStatus = (r: { status: string; expiresAt: Date | null }) => (isPastExpiry(r) ? "EXPIRED" : r.status);

// ---------- list ----------
export async function listRewards(opts: {
  status?: string | null; source?: string | null; search?: string | null; take?: number; skip?: number;
}) {
  const where: Prisma.RewardRedemptionWhereInput = {};
  if (opts.status && (STATUSES as readonly string[]).includes(opts.status)) where.status = opts.status as Prisma.RewardRedemptionWhereInput["status"];
  if (opts.source) where.source = opts.source;
  const s = (opts.search || "").trim();
  if (s) where.OR = [{ code: { contains: s.toUpperCase() } }, { campaignName: { contains: s, mode: "insensitive" } }];

  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const [rows, total, grouped] = await Promise.all([
    db.rewardRedemption.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    db.rewardRedemption.count({ where }),
    db.rewardRedemption.groupBy({ by: ["status"], _count: { _all: true } }), // global status counts (summary cards)
  ]);

  const userIds = [...new Set(rows.flatMap((r) => [r.issuedToUserId, r.redeemedByUserId]).filter(Boolean) as string[])];
  const subIds = rows.map((r) => r.subscriptionId).filter(Boolean) as string[];
  const [users, subs] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    subIds.length ? db.subscription.findMany({ where: { id: { in: subIds } }, select: { id: true, status: true } }) : Promise.resolve([]),
  ]);
  const uMap = new Map(users.map((u) => [u.id, u]));
  const sMap = new Map(subs.map((x) => [x.id, x]));

  const counts = { ALL: 0, ISSUED: 0, REDEEMED: 0, EXPIRED: 0, CANCELLED: 0 } as Record<string, number>;
  for (const g of grouped) { counts[g.status] = g._count._all; counts.ALL += g._count._all; }

  return {
    total, take, skip, counts,
    rows: rows.map((r) => ({
      id: r.id, code: r.code, campaignName: r.campaignName, source: r.source,
      productLabel: `${mlLabel(r.variantMl)} × ${r.qty}`, variantMl: r.variantMl, qty: r.qty, planSlug: r.planSlug,
      status: effStatus(r), rawStatus: r.status, issuedAt: r.issuedAt, expiresAt: r.expiresAt, redeemedAt: r.redeemedAt,
      issuedTo: r.issuedToUserId ? (uMap.get(r.issuedToUserId) ?? { id: r.issuedToUserId, name: null, email: null }) : null,
      redeemedBy: r.redeemedByUserId ? (uMap.get(r.redeemedByUserId) ?? { id: r.redeemedByUserId, name: null, email: null }) : null,
      subscription: r.subscriptionId ? (sMap.get(r.subscriptionId) ?? { id: r.subscriptionId, status: null }) : null,
      winnerId: r.winnerId,
    })),
  };
}

// ---------- detail ----------
export async function getRewardDetail(id: string) {
  const r = await db.rewardRedemption.findUnique({ where: { id } });
  if (!r) throw Errors.notFound("Reward not found.");
  const [issuedTo, redeemedBy, createdBy, deliveries, sub, winner] = await Promise.all([
    r.issuedToUserId ? db.user.findUnique({ where: { id: r.issuedToUserId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    r.redeemedByUserId ? db.user.findUnique({ where: { id: r.redeemedByUserId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    r.createdById ? db.user.findUnique({ where: { id: r.createdById }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    r.subscriptionId ? db.delivery.count({ where: { subscriptionId: r.subscriptionId } }) : Promise.resolve(0),
    r.subscriptionId ? db.subscription.findUnique({ where: { id: r.subscriptionId }, select: { id: true, status: true, startDate: true, endDate: true, plan: { select: { name: true, slug: true } }, items: { select: { qty: true, variant: { select: { ml: true } } } } } }) : Promise.resolve(null),
    r.winnerId ? db.puzzleWinner.findUnique({ where: { id: r.winnerId }, select: { id: true, prizeStatus: true, puzzle: { select: { monthIndex: true, title: true } } } }) : Promise.resolve(null),
  ]);
  const { token, ...safe } = r; // never echo the raw token; expose the ready-made claim URL instead
  void token;
  return {
    ...safe,
    status: effStatus(r),
    productLabel: `${mlLabel(r.variantMl)} × ${r.qty}`,
    claimUrl: rewardClaimUrl(r.token),
    canCancel: effStatus(r) === "ISSUED" || effStatus(r) === "EXPIRED",
    canResend: !!r.issuedToUserId && effStatus(r) === "ISSUED",
    issuedTo, redeemedBy, createdBy,
    subscription: sub ? { ...sub, deliveryCount: deliveries } : null,
    winner,
  };
}

// ---------- issue (manual) ----------
export interface AdminIssueInput {
  campaignName: string;
  issuedToEmail?: string | null;   // bind to a customer by email (optional)
  productSlug?: string; variantMl?: number; qty?: number; planSlug?: string;
  expiresInDays?: number | null;
  notes?: string | null;
  notify?: boolean;                // send the claim link now (only if bound to a real customer)
  actor: AdminActor; ctx?: ReqContext;
}
export async function adminIssueReward(input: AdminIssueInput) {
  const campaignName = (input.campaignName || "").trim();
  if (!campaignName) throw Errors.badRequest("Campaign name is required.");

  let boundUser: { id: string; name: string | null; email: string | null } | null = null;
  if (input.issuedToEmail && input.issuedToEmail.trim()) {
    const email = input.issuedToEmail.trim().toLowerCase();
    boundUser = await db.user.findFirst({ where: { email }, select: { id: true, name: true, email: true } });
    if (!boundUser) throw Errors.badRequest(`No customer found with email ${email}. Leave it blank to issue an unbound reward anyone can claim.`);
  }
  const expiresAt = input.expiresInDays && input.expiresInDays > 0 ? new Date(Date.now() + input.expiresInDays * 864e5) : null;

  const reward = await issueReward({
    campaignName, issuedToUserId: boundUser?.id ?? null, source: "manual",
    productSlug: input.productSlug ?? "milk", variantMl: input.variantMl ?? 1000, qty: input.qty ?? 1, planSlug: input.planSlug ?? "p7",
    expiresAt, createdById: input.actor.userId ?? null, notes: input.notes?.trim() || null,
  });

  if (input.notify && boundUser) {
    await db.notification.create({ data: {
      userId: boundUser.id, channel: "IN_APP", sentAt: new Date(),
      title: "🎁 You have a DOODLY reward to claim!",
      body: `Claim "${reward.campaignName}": ${rewardClaimUrl(reward.token)} — or enter code ${reward.code} at doodly.in/rewards/claim.` + (expiresAt ? ` Valid until ${expiresAt.toDateString()}.` : ""),
    } }).catch(() => {});
  }
  await audit({ userId: input.actor.userId ?? null, actorRole: input.actor.role ?? "admin", action: "reward.admin_issued", target: `${reward.code} (${reward.campaignName})${boundUser ? ` → ${boundUser.email}` : " (unbound)"}`, ctx: input.ctx });
  return { id: reward.id, code: reward.code, claimUrl: rewardClaimUrl(reward.token), status: reward.status, boundTo: boundUser };
}

// ---------- cancel ----------
export async function cancelReward(id: string, actor: AdminActor, ctx?: ReqContext, reason?: string | null) {
  const r = await db.rewardRedemption.findUnique({ where: { id } });
  if (!r) throw Errors.notFound("Reward not found.");
  if (r.status === "REDEEMED") throw Errors.conflict("This reward has already been claimed and can't be cancelled.");
  if (r.status === "CANCELLED") return { id, status: "CANCELLED" as const };
  const note = reason?.trim() ? `${r.notes ? r.notes + " | " : ""}Cancelled: ${reason.trim()}` : r.notes;
  const res = await db.rewardRedemption.updateMany({ where: { id, status: { in: ["ISSUED", "EXPIRED"] } }, data: { status: "CANCELLED", notes: note } });
  if (res.count !== 1) throw Errors.conflict("Reward can no longer be cancelled.");
  await audit({ userId: actor.userId ?? null, actorRole: actor.role ?? "admin", action: "reward.cancelled", target: `${r.code} (${r.campaignName})`, ctx });
  return { id, status: "CANCELLED" as const };
}

// ---------- resend claim reminder ----------
export async function resendRewardNotification(id: string, actor: AdminActor, ctx?: ReqContext) {
  const r = await db.rewardRedemption.findUnique({ where: { id } });
  if (!r) throw Errors.notFound("Reward not found.");
  if (!r.issuedToUserId) throw Errors.badRequest("This reward isn't linked to a customer account — share the claim link or code directly.");
  const eff = effStatus(r);
  if (eff !== "ISSUED") throw Errors.badRequest(`This reward is ${eff.toLowerCase()} — a reminder can only be sent for an unclaimed reward.`);
  await db.notification.create({ data: {
    userId: r.issuedToUserId, channel: "IN_APP", sentAt: new Date(),
    title: "🎁 Reminder: claim your DOODLY reward",
    body: `Don't miss out! Claim "${r.campaignName}": ${rewardClaimUrl(r.token)} — or enter code ${r.code} at doodly.in/rewards/claim.` + (r.expiresAt ? ` Valid until ${new Date(r.expiresAt).toDateString()}.` : ""),
  } });
  await audit({ userId: actor.userId ?? null, actorRole: actor.role ?? "admin", action: "reward.reminder_sent", target: `${r.code} → user ${r.issuedToUserId}`, ctx });
  return { ok: true };
}
