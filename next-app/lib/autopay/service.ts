/* =============================================================
   DOODLY — AutoPay (Razorpay recurring) service: the ONE place that
   creates/controls mandates. Reuses AutopaySubscription / RenewalHistory
   / PaymentAttempt + the notify() + audit layers. Every state change is
   audited and (opt-in respecting) notified. Never throws into a route —
   returns a typed result or a thrown ApiError the route maps.

   Lifecycle: enable → (customer authorises in Checkout) → authenticated
   /activated → charged (each cycle) → halted (Razorpay's retries
   exhausted → SUSPENDED, we notify+escalate, never silent-cancel) ·
   pause/resume/cancel are customer/admin controls. Retry = resume
   (Razorpay re-attempts the cycle). AutoPay is SUBSCRIPTION-ONLY and
   strictly opt-in (never created unless the customer asked).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { createSubscription, cancelSubscription, pauseSubscription, resumeSubscription } from "@/lib/razorpay";
import { notify } from "@/lib/notifications/dispatch";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";
import { log } from "@/lib/logger";

const KEY_ID = () => process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || undefined;
const rs = (paise: number) => Math.round((paise || 0) / 100).toLocaleString("en-IN");

/** The signed-in customer's mandate for a subscription they own (or null). */
export async function ownedMandate(userId: string, opts: { subscriptionId?: string; gatewaySubId?: string }) {
  const where = opts.gatewaySubId ? { gatewaySubId: opts.gatewaySubId } : { subscriptionId: opts.subscriptionId };
  const ap = await db.autopaySubscription.findFirst({
    where, include: { subscription: { select: { id: true, userId: true, plan: { select: { name: true, slug: true } } } } },
  });
  if (!ap || ap.subscription?.userId !== userId) return null;
  return ap;
}

/**
 * Enable AutoPay for an owned subscription: create the Razorpay recurring
 * mandate + the AutopaySubscription row (PENDING auth). Returns the gateway
 * subscription id + key so Checkout can open the mandate-authorisation popup.
 */
export async function enableAutopay(args: { userId: string; subscriptionId: string; planSlug: string; variantId?: string; totalCount: number; amountPaise: number; ctx?: ReqContext }) {
  const owned = await db.subscription.findFirst({ where: { id: args.subscriptionId, userId: args.userId }, select: { id: true, plan: { select: { name: true } } } });
  if (!owned) throw Errors.notFound("Subscription not found on your account.");

  const rzpSub = await createSubscription(args.planSlug, { totalCount: args.totalCount, variantId: args.variantId, customerNotify: true, notes: { subscriptionId: args.subscriptionId, userId: args.userId } });
  await db.autopaySubscription.upsert({
    where: { subscriptionId: args.subscriptionId },
    create: { gatewaySubId: rzpSub.id, subscriptionId: args.subscriptionId, status: "INACTIVE", nextRenewalAt: new Date(), amountPaise: args.amountPaise },
    update: { gatewaySubId: rzpSub.id, status: "INACTIVE", amountPaise: args.amountPaise },
  });
  await db.subscription.update({ where: { id: args.subscriptionId }, data: { autoRenew: true } }).catch(() => {});
  await audit({ userId: args.userId, actorRole: "customer", action: "autopay.enable", target: `${args.subscriptionId} → ${rzpSub.id}`, ctx: args.ctx });
  return { gatewaySubId: rzpSub.id, keyId: KEY_ID(), shortUrl: (rzpSub as { short_url?: string }).short_url };
}

/** Mark the mandate ACTIVE once Razorpay authenticates/activates it (webhook). */
export async function activateMandate(gatewaySubId: string, nextRenewalAt?: Date) {
  const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId }, include: { subscription: { select: { userId: true, plan: { select: { name: true } } } } } });
  if (!ap) return;
  await db.autopaySubscription.update({ where: { id: ap.id }, data: { status: "ACTIVE", attempts: 0, ...(nextRenewalAt ? { nextRenewalAt } : {}) } });
  await db.subscription.update({ where: { id: ap.subscriptionId }, data: { autoRenew: true, status: "ACTIVE" } }).catch(() => {});
  const uid = ap.subscription?.userId;
  if (uid) {
    const first = (await firstName(uid));
    notify(uid, {
      title: "AutoPay is on 🔄",
      body: `Your ${ap.subscription?.plan?.name || "DOODLY"} plan will now renew automatically — never miss your morning milk. Manage it anytime from My Subscription.`,
      email: true,
      whatsapp: { template: "sub_activated", vars: [first, ap.subscription?.plan?.name || "DOODLY", new Date(ap.nextRenewalAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })] },
    }).catch(() => {});
    await audit({ userId: uid, actorRole: "system", action: "autopay.activated", target: gatewaySubId });
  }
}

/** Record one renewal charge in the audit trail (called from subscription.charged). */
export async function recordRenewal(gatewaySubId: string, amountPaise: number, ok: boolean, gatewayRef?: string, error?: string) {
  const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId }, select: { id: true } });
  if (!ap) return;
  const renewal = await db.renewalHistory.create({ data: { autopayId: ap.id, amountPaise, status: ok ? "SUCCESS" : "FAILED" } });
  await db.paymentAttempt.create({ data: { renewalId: renewal.id, status: ok ? "SUCCESS" : "FAILED", gatewayRef, error } }).catch(() => {});
}

/** Razorpay exhausted its retries → SUSPEND (not cancel) + notify/escalate. */
export async function onMandateHalted(gatewaySubId: string) {
  const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId }, include: { subscription: { select: { userId: true, plan: { select: { name: true } } } } } });
  if (!ap) return;
  await db.autopaySubscription.update({ where: { id: ap.id }, data: { status: "SUSPENDED" } });
  const uid = ap.subscription?.userId;
  if (uid) {
    notify(uid, {
      title: "Action needed: AutoPay is paused ⚠️",
      body: `We couldn't renew your ${ap.subscription?.plan?.name || "DOODLY"} plan (₹${rs(ap.amountPaise)}). Your deliveries are paused, not cancelled — update your payment method and resume AutoPay in a tap to continue.`,
      email: true,
    }).catch(() => {});
    await audit({ userId: uid, actorRole: "system", action: "autopay.suspended", target: gatewaySubId });
  }
}

async function firstName(userId: string) {
  try { const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } }); return (u?.name || "").trim().split(/\s+/)[0] || "there"; } catch { return "there"; }
}

// ---------- customer controls (ownership already verified by the route) ----------

export async function cancelAutopay(ap: { id: string; gatewaySubId: string | null; subscriptionId: string }, userId: string) {
  if (ap.gatewaySubId) await cancelSubscription(ap.gatewaySubId, true).catch((e) => log.error("autopay.cancel", (e as Error)?.message));
  await db.autopaySubscription.update({ where: { id: ap.id }, data: { status: "CANCELLED" } });
  await db.subscription.update({ where: { id: ap.subscriptionId }, data: { autoRenew: false } }).catch(() => {});
  await audit({ userId, actorRole: "customer", action: "autopay.cancel", target: ap.gatewaySubId ?? ap.subscriptionId });
  return { status: "CANCELLED" as const };
}

export async function pauseAutopay(ap: { id: string; gatewaySubId: string | null }, userId: string) {
  if (ap.gatewaySubId) await pauseSubscription(ap.gatewaySubId).catch((e) => log.error("autopay.pause", (e as Error)?.message));
  await db.autopaySubscription.update({ where: { id: ap.id }, data: { status: "INACTIVE" } });
  await audit({ userId, actorRole: "customer", action: "autopay.pause", target: ap.gatewaySubId ?? ap.id });
  return { status: "INACTIVE" as const };
}

/** Resume a paused/suspended mandate — also the "retry a failed renewal" action. */
export async function resumeAutopay(ap: { id: string; gatewaySubId: string | null }, userId: string, actorRole = "customer") {
  if (ap.gatewaySubId) await resumeSubscription(ap.gatewaySubId).catch((e) => log.error("autopay.resume", (e as Error)?.message));
  await db.autopaySubscription.update({ where: { id: ap.id }, data: { status: "ACTIVE", attempts: 0 } });
  await audit({ userId, actorRole, action: "autopay.resume", target: ap.gatewaySubId ?? ap.id });
  return { status: "ACTIVE" as const };
}

// ---------- read models ----------

export async function customerAutopay(userId: string) {
  const rows = await db.autopaySubscription.findMany({
    where: { subscription: { userId } },
    include: { subscription: { select: { id: true, plan: { select: { name: true, slug: true } } } }, renewals: { orderBy: { chargedAt: "desc" }, take: 10 } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((ap) => ({
    id: ap.id, gatewaySubId: ap.gatewaySubId, subscriptionId: ap.subscriptionId,
    plan: ap.subscription?.plan?.name ?? null, planSlug: ap.subscription?.plan?.slug ?? null,
    status: ap.status, amountPaise: ap.amountPaise, nextRenewalAt: ap.nextRenewalAt.toISOString(), attempts: ap.attempts,
    renewals: ap.renewals.map((r) => ({ amountPaise: r.amountPaise, status: r.status, chargedAt: r.chargedAt.toISOString() })),
  }));
}

/** Daily cron: remind ACTIVE-mandate customers 2 days before their renewal.
    Day-window + daily cron ⇒ at most one reminder per renewal. Opt-ins respected. */
export async function autopayRenewalReminders(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + 2);
  const end = new Date(start.getTime() + 86400000 - 1);
  const due = await db.autopaySubscription.findMany({
    where: { status: "ACTIVE", nextRenewalAt: { gte: start, lte: end } },
    include: { subscription: { select: { userId: true, plan: { select: { name: true } } } } }, take: 2000,
  });
  let reminded = 0;
  for (const ap of due) {
    const uid = ap.subscription?.userId; if (!uid) continue;
    try {
      const nextDate = new Date(ap.nextRenewalAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      await notify(uid, {
        title: "Your DOODLY plan renews in 2 days 🔄",
        body: `Your ${ap.subscription?.plan?.name || "DOODLY"} plan renews on ${nextDate} via AutoPay (₹${rs(ap.amountPaise)}). Nothing to do — just keep enjoying your morning milk. Manage AutoPay anytime from My Subscription.`,
        email: true,
      });
      reminded++;
    } catch { /* non-blocking */ }
  }
  return { candidates: due.length, reminded };
}

export async function adminAutopayStats() {
  const [byStatus, upcoming, failed30] = await Promise.all([
    db.autopaySubscription.groupBy({ by: ["status"], _count: true }),
    db.autopaySubscription.count({ where: { status: "ACTIVE", nextRenewalAt: { lte: new Date(Date.now() + 7 * 86400000) } } }),
    db.renewalHistory.count({ where: { status: "FAILED", chargedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  const c = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return { total: byStatus.reduce((s, b) => s + b._count, 0), active: c("ACTIVE"), suspended: c("SUSPENDED") + c("RETRY"), cancelled: c("CANCELLED"), paused: c("INACTIVE"), upcoming7d: upcoming, failedRenewals30d: failed30 };
}

export async function adminAutopayList(args: { status?: string; q?: string; limit?: number } = {}) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status.toUpperCase();
  if (args.q?.trim()) where.subscription = { user: { OR: [{ name: { contains: args.q.trim(), mode: "insensitive" } }, { phone: { contains: args.q.trim() } }, { email: { contains: args.q.trim(), mode: "insensitive" } }] } };
  const rows = await db.autopaySubscription.findMany({
    where, orderBy: { nextRenewalAt: "asc" }, take: args.limit ?? 300,
    include: { subscription: { select: { plan: { select: { name: true } }, user: { select: { id: true, name: true, phone: true, email: true } } } } },
  });
  return rows.map((ap) => ({
    id: ap.id, gatewaySubId: ap.gatewaySubId, status: ap.status, amountPaise: ap.amountPaise,
    nextRenewalAt: ap.nextRenewalAt.toISOString(), attempts: ap.attempts,
    customer: ap.subscription?.user?.name ?? null, phone: ap.subscription?.user?.phone ?? null, email: ap.subscription?.user?.email ?? null,
    plan: ap.subscription?.plan?.name ?? null,
  }));
}
