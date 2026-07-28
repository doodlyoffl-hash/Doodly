/* =============================================================
   DOODLY — Reward Redemption engine
   Single-use claimable rewards (e.g. puzzle winners): each RewardRedemption
   carries a coupon `code` + a claim-link `token`. Redeeming it creates a NORMAL
   ₹0 subscription (reuses Plan p7 + Subscription + generateAllForSubscription) so
   every operational module (packing, delivery, auto-assign, reports, dashboard,
   exec app) treats it exactly like a paid subscription — no special handling.
   Reuse-first: mirrors awardPrize's subscription shape + the /api/addresses
   serviceability/create helpers. Nothing is ever hard-deleted.
   ============================================================= */
import "server-only";
import { randomBytes } from "crypto";
import { Prisma, type RewardRedemption } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { Errors } from "@/lib/http";
import { rateLimit } from "@/lib/auth/ratelimit";
import { checkServiceable } from "@/lib/addresses/serviceability";
import { assertServiceable, buildAddressData, NOT_SERVICEABLE } from "@/lib/addresses/helpers";
import { geocodeAddress } from "@/lib/geo/geocode";
import { generateAllForSubscription } from "@/lib/subscriptions/deliveries";
import { log } from "@/lib/logger";
import type { ReqContext } from "@/lib/auth/request";

// ---------- secrets ----------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I/L/O/U — typo-resistant
function base32(buf: Buffer): string {
  let s = "";
  for (const b of buf) s += CROCKFORD[b % 32];
  return s;
}
/** Human-typable single-use code, e.g. "DOODLYPUZZLE-8X4K2M". */
function generateCode(): string {
  return "DOODLYPUZZLE-" + base32(randomBytes(6));
}
/** Unguessable claim-link token (256-bit), only ever in the link. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
/** The customer-facing claim URL (must land on the STATIC storefront, not the API). */
export function rewardClaimUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.doodly.in").replace(/\/+$/, "");
  return `${base}/rewards/claim?token=${encodeURIComponent(token)}`;
}

async function notifyUser(userId: string, title: string, body: string) {
  try { await db.notification.create({ data: { userId, channel: "IN_APP", title, body, sentAt: new Date() } }); }
  catch (e) { log.error("rewards", `notify failed: ${(e as Error).message}`); }
}

/** Resolve the reward's product variant by ml (active preferred). */
export async function resolveRewardVariant(productSlug: string, ml: number) {
  const p = await db.product.findUnique({ where: { slug: productSlug }, include: { variants: true } });
  return p?.variants.find((v) => v.ml === ml && v.active) ?? p?.variants.find((v) => v.ml === ml) ?? null;
}

// ---------- issue ----------
export interface IssueRewardInput {
  winnerId?: string | null;
  issuedToUserId?: string | null;
  campaignName: string;
  source?: string;                 // "puzzle_challenge" | "manual"
  productSlug?: string;
  variantMl?: number;
  qty?: number;
  planSlug?: string;
  expiresAt?: Date | null;
  createdById?: string | null;
  notes?: string | null;
}
/** Create a claimable reward (crypto-random code+token). Idempotent per winnerId. */
export async function issueReward(input: IssueRewardInput): Promise<RewardRedemption> {
  if (input.winnerId) {
    const existing = await db.rewardRedemption.findFirst({ where: { winnerId: input.winnerId } });
    if (existing) return existing;
  }
  const data = {
    campaignName: input.campaignName,
    source: input.source ?? "manual",
    productSlug: input.productSlug ?? "milk",
    variantMl: input.variantMl ?? 1000,
    qty: input.qty ?? 1,
    planSlug: input.planSlug ?? "p7",
    winnerId: input.winnerId ?? null,
    issuedToUserId: input.issuedToUserId ?? null,
    expiresAt: input.expiresAt ?? null,
    createdById: input.createdById ?? null,
    notes: input.notes ?? null,
  };
  // Regenerate on the (astronomically unlikely) unique clash on code/token.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const reward = await db.rewardRedemption.create({ data: { ...data, code: generateCode(), token: generateToken() } });
      await audit({ userId: input.issuedToUserId ?? null, actorRole: input.createdById ? "admin" : "system", action: "reward.issued", target: `${reward.code} (${reward.campaignName})` }).catch(() => {});
      return reward;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw Errors.badRequest("Could not generate a unique reward code — please retry.");
}

// ---------- lookup + validate ----------
export async function findReward(sel: { code?: string | null; token?: string | null }) {
  if (sel.token) return db.rewardRedemption.findUnique({ where: { token: sel.token } });
  if (sel.code) return db.rewardRedemption.findUnique({ where: { code: sel.code.trim().toUpperCase() } });
  return null;
}

/** Lazily flip an expired ISSUED reward → EXPIRED; return the effective status. */
async function effectiveStatus(reward: RewardRedemption): Promise<RewardRedemption["status"]> {
  if (reward.status === "ISSUED" && reward.expiresAt && reward.expiresAt.getTime() < Date.now()) {
    await db.rewardRedemption.updateMany({ where: { id: reward.id, status: "ISSUED" }, data: { status: "EXPIRED" } }).catch(() => {});
    return "EXPIRED";
  }
  return reward.status;
}

/** Throw the right ApiError unless the reward is claimable right now. */
export async function assertClaimable(reward: RewardRedemption): Promise<void> {
  const st = await effectiveStatus(reward);
  if (st === "REDEEMED") throw Errors.conflict("This reward has already been claimed.");
  if (st === "EXPIRED") throw Errors.badRequest("This reward has expired.");
  if (st === "CANCELLED") throw Errors.badRequest("This reward is no longer valid.");
  // ISSUED → ok
}

const ML_LABEL = (ml: number) => (ml % 1000 === 0 ? `${ml / 1000} L` : `${ml} ml`);

/** Public claim view (safe — never echoes the token). Only a missing reward 404s;
    expired/redeemed/cancelled return with a reason so the page can explain. */
export async function getClaimView(sel: { code?: string | null; token?: string | null }, userId: string | null) {
  const reward = await findReward(sel);
  if (!reward) throw Errors.notFound("We couldn't find that reward.");
  const status = await effectiveStatus(reward);
  const boundToOther = !!(reward.issuedToUserId && userId && reward.issuedToUserId !== userId);
  const reason = boundToOther ? "bound_to_other" : status === "ISSUED" ? "ok" : status.toLowerCase();
  const claimable = status === "ISSUED" && !boundToOther;

  let addresses: { id: string; label: string; line1: string; city: string; pincode: string; isDefault: boolean; serviceable: boolean }[] = [];
  if (userId) {
    const rows = await db.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { label: "asc" }] });
    addresses = await Promise.all(rows.map(async (a) => ({
      id: a.id, label: a.label, line1: a.line1, city: a.city, pincode: a.pincode, isDefault: a.isDefault,
      serviceable: (await checkServiceable(a.pincode)).serviceable,
    })));
  }
  return {
    signedIn: !!userId,
    reward: {
      code: reward.code, campaignName: reward.campaignName,
      productLabel: `${ML_LABEL(reward.variantMl)} A2 Buffalo Milk × ${reward.qty}`,
      planSlug: reward.planSlug, planDays: 7,
      status, reason, claimable, boundToOther, expiresAt: reward.expiresAt,
    },
    addresses,
  };
}

/** The signed-in customer's rewards, for the account dashboard card:
    claimable (ISSUED + unexpired, soonest-expiry first) + already-claimed active ones. */
export async function getUserRewards(userId: string) {
  const rows = await db.rewardRedemption.findMany({ where: { issuedToUserId: userId }, orderBy: { createdAt: "desc" } });
  const claimableRows = rows.filter((r) => r.status === "ISSUED" && !(r.expiresAt && r.expiresAt.getTime() < Date.now()));
  const slugs = [...new Set(claimableRows.map((r) => r.planSlug))];
  const plans = slugs.length ? await db.plan.findMany({ where: { slug: { in: slugs } }, select: { slug: true, days: true } }) : [];
  const dayMap = new Map(plans.map((p) => [p.slug, p.days]));
  const claimable = claimableRows
    .map((r) => ({ code: r.code, campaignName: r.campaignName, productLabel: `${ML_LABEL(r.variantMl)} A2 Buffalo Milk × ${r.qty}`, planDays: dayMap.get(r.planSlug) ?? 7, expiresAt: r.expiresAt }))
    .sort((a, b) => (a.expiresAt ? a.expiresAt.getTime() : Infinity) - (b.expiresAt ? b.expiresAt.getTime() : Infinity));
  const active = rows.filter((r) => r.status === "REDEEMED" && r.subscriptionId).map((r) => ({ campaignName: r.campaignName, subscriptionId: r.subscriptionId }));
  return { claimable, active };
}

// ---------- redeem (the engine) ----------
export interface RedeemInput {
  code?: string | null;
  token?: string | null;
  userId: string;
  addressId?: string | null;
  newAddress?: Record<string, unknown> | null;
  ctx?: ReqContext;
}
export async function redeemReward(input: RedeemInput): Promise<{ subscriptionId: string; reward: RewardRedemption }> {
  const rl = rateLimit(`reward:redeem:${input.userId}`, 5, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const reward = await findReward({ code: input.code, token: input.token });
  if (!reward) throw Errors.notFound("We couldn't find that reward.");
  await assertClaimable(reward);
  if (reward.issuedToUserId && reward.issuedToUserId !== input.userId) {
    throw Errors.forbidden("This reward is linked to a different DOODLY account.");
  }

  // Resolve a SERVICEABLE delivery address — the reward is NOT consumed on failure.
  let addressId: string;
  if (input.newAddress) {
    const pin = String((input.newAddress as { pincode?: unknown }).pincode ?? "").replace(/\D/g, "").slice(0, 6);
    if (!/^[1-9]\d{5}$/.test(pin)) throw Errors.badRequest("Enter a valid 6-digit pincode.");
    const sp = await assertServiceable(pin);                      // throws NOT_SERVICEABLE before any write
    const data = buildAddressData({ ...input.newAddress, pincode: pin }, sp) as Record<string, unknown> & { lat?: number | null; lng?: number | null };
    if (data.lat == null || data.lng == null) {
      try { const g = await geocodeAddress({ line1: String(data.line1 ?? ""), city: String(data.city ?? ""), pincode: pin }); if (g) { data.lat = g.lat; data.lng = g.lng; } } catch { /* geocode is best-effort */ }
    }
    const count = await db.address.count({ where: { userId: input.userId } });
    const created = await db.address.create({ data: { ...(data as object), userId: input.userId, isDefault: count === 0 } as Prisma.AddressUncheckedCreateInput });
    addressId = created.id;
  } else {
    if (!input.addressId) throw Errors.badRequest("Choose a delivery address.");
    const addr = await db.address.findFirst({ where: { id: input.addressId, userId: input.userId } });
    if (!addr) throw Errors.notFound("Address not found.");
    if (!(await checkServiceable(addr.pincode)).serviceable) throw Errors.badRequest(NOT_SERVICEABLE, { pincode: NOT_SERVICEABLE });
    addressId = addr.id;
  }

  const plan = await db.plan.findUnique({ where: { slug: reward.planSlug } });
  if (!plan) throw Errors.notFound("Reward plan not found.");
  const variant = await resolveRewardVariant(reward.productSlug, reward.variantMl);
  if (!variant) throw Errors.notFound("Reward product variant not found.");

  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + plan.days);

  // Atomic: create sub + event + SINGLE-USE guard. Any throw rolls all three back.
  const sub = await db.$transaction(async (tx) => {
    const s = await tx.subscription.create({
      data: {
        userId: input.userId, planId: plan.id, addressId,
        status: "ACTIVE", startDate: start, endDate: end, nextDeliveryAt: start,
        autoRenew: false, targetDeliveries: plan.days,
        notes: `DOODLY Puzzle Winner Reward — ${reward.campaignName}. Free of charge.`,
        items: { create: [{ variantId: variant.id, qty: reward.qty }] },
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: s.id, type: "CREATED",
        summary: `FREE ${plan.name} — ${reward.campaignName} reward`,
        detail: { source: "puzzle_reward", rewardId: reward.id, code: reward.code },
        byId: input.userId, byRole: "customer",
      },
    });
    const guard = await tx.rewardRedemption.updateMany({
      where: { id: reward.id, status: "ISSUED" },
      data: { status: "REDEEMED", redeemedAt: new Date(), redeemedByUserId: input.userId, subscriptionId: s.id },
    });
    if (guard.count !== 1) throw Errors.conflict("This reward has already been claimed.");
    return s;
  });

  // Post-commit (idempotent, self-healing) — a delivery hiccup can't roll back the claim.
  if (reward.winnerId) {
    await db.puzzleWinner.update({ where: { id: reward.winnerId }, data: { prizeStatus: "AWARDED", subscriptionId: sub.id } }).catch(() => {});
  }
  await generateAllForSubscription(sub.id, plan.days).catch((e) => log.error("rewards", `delivery gen failed for ${sub.id}: ${(e as Error).message}`));
  await notifyUser(input.userId, "🎁 Your DOODLY reward is active!",
    `Your FREE 7-Day Fresh Start (${ML_LABEL(reward.variantMl)} A2 Buffalo Milk) is confirmed — your first delivery arrives ${start.toDateString()}. Enjoy!`);
  await audit({ userId: input.userId, actorRole: "customer", action: "reward.redeemed", target: `${reward.code} → subscription ${sub.id}`, ctx: input.ctx }).catch(() => {});

  return { subscriptionId: sub.id, reward };
}
