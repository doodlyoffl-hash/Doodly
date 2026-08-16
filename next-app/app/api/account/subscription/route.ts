/* /api/account/subscription — the signed-in customer's subscriptions.
   GET  — list with plan, address, items, per-delivery price, the delivery
          schedule (for the calendar) and the lifecycle event timeline.
   POST — lifecycle actions on one of the user's own subscriptions:
          pause (Vacation) · resume · cancel (whole) · skip / cancel_date
          (specific dates — made up at the end, so no paid day is lost). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { applyDueForSubscription, cancelScheduledForSubscription } from "@/lib/addresses/scheduled-change";
import { cancelSubscription, logSubEvent, changeFrequency, changeQuantity, previewSubscriptionChange } from "@/lib/subscriptions/admin";
import { skipOrCancelDates, removeScheduledDeliveries, reconcileSchedule } from "@/lib/subscriptions/deliveries";
import { notifySubscriptionPaused, notifySubscriptionResumed } from "@/lib/notifications/dispatch";
import { bottleOwnership } from "@/lib/bottles/ownership";

/** Compact per-customer bottle-ownership snapshot for the dashboard (best-effort). */
async function ownershipLite(userId: string) {
  try { const o = await bottleOwnership(userId); return { owned: o.owned, depositHeldPaise: o.depositHeldPaise, perBottlePaise: o.perBottlePaise, status: o.status }; }
  catch { return null; }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subInclude = {
  plan: { select: { name: true, days: true, discountBps: true } },
  address: { select: { label: true, line1: true, line2: true, city: true, pincode: true } },
  items: { include: { variant: { select: { label: true, ml: true, dailyPaise: true, product: { select: { name: true } } } } } },
  deliveries: { select: { date: true, status: true, adjustReason: true }, orderBy: { date: "asc" } },
  events: { select: { type: true, summary: true, detail: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 25 },
} as const;

type SubWith = Awaited<ReturnType<typeof loadSub>>;
function loadSub(userId: string) {
  return db.subscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: subInclude });
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const cadenceLabelOf = (c: number) => (c <= 1 ? "Daily" : c === 2 ? "Alternate-day" : `Every ${c} days`);
// Delivery statuses counted as fulfilled (a day served).
const FULFILLED = new Set(["DELIVERED", "PARTIALLY_DELIVERED"]);

type OwnershipLite = { owned: number; depositHeldPaise: number; perBottlePaise: number; status: string } | null;

function shape(s: NonNullable<SubWith>[number], ownership: OwnershipLite) {
  const perDeliveryPaise = s.items.reduce((sum, i) => sum + i.qty * (i.variant.dailyPaise ?? 0), 0);
  const cadence = Math.max(1, s.cadence ?? 1);
  const target = s.targetDeliveries ?? s.plan.days ?? 0;
  const completedDeliveries = s.deliveries.filter((d) => FULFILLED.has(d.status)).length;
  const remainingDeliveries = Math.max(0, target - completedDeliveries);
  // The end date the plan WOULD have on an unbroken run (no skips/misses) — the baseline the
  // extended endDate is measured against. Cadence-aware (alternate-day spans ~2×).
  const originalEndDate = addDays(startOfDay(s.startDate), Math.max(0, (s.plan.days ?? 0) - 1) * cadence);
  return {
    id: s.id, status: s.status, startDate: s.startDate, endDate: s.endDate, originalEndDate,
    nextDeliveryAt: s.nextDeliveryAt, deliverySlot: s.deliverySlot, autoRenew: s.autoRenew,
    pausedFrom: s.pausedFrom, pausedUntil: s.pausedUntil, skipDates: s.skipDates,
    targetDeliveries: target, completedDeliveries, remainingDeliveries,
    cadence, frequency: cadenceLabelOf(cadence),
    paymentStatus: { autoRenew: s.autoRenew, label: s.autoRenew ? "AutoPay on" : "Manual renewal" },
    bottleOwnership: ownership,
    plan: s.plan, address: s.address, perDeliveryPaise,
    items: s.items.map((i) => ({ qty: i.qty, label: i.variant.label, ml: i.variant.ml, product: i.variant.product.name, dailyPaise: i.variant.dailyPaise })),
    schedule: s.deliveries.map((d) => ({ date: d.date, status: d.status, adjustReason: d.adjustReason })),
    events: s.events.map((e) => ({ type: e.type, summary: e.summary, detail: e.detail, at: e.createdAt })),
  };
}

export const GET = route("account.subscription.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  // Lazy safety-net: apply any address change whose effective date has arrived.
  const own = await db.subscription.findMany({ where: { userId }, select: { id: true } });
  for (const s of own) { try { await applyDueForSubscription(s.id); } catch { /* non-blocking */ } }
  const subs = await loadSub(userId);
  const ownership = await ownershipLite(userId);
  return ok({ subscriptions: subs.map((s) => shape(s, ownership)) });
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume", "cancel", "skip", "cancel_date", "autopay_on", "autopay_off", "change_frequency", "change_quantity", "preview_change"]),
  until: z.string().datetime().optional(),               // pause: vacation end
  date: z.string().datetime().optional(),                // skip: one delivery date
  dates: z.array(z.string().datetime()).min(1).max(60).optional(), // cancel_date: many
  reason: z.string().max(300).optional(),                // cancel reason
  cadence: z.number().int().min(1).max(7).optional(),    // change_frequency / preview
  qty: z.number().int().min(1).max(50).optional(),       // change_quantity / preview
});

export const POST = route("account.subscription.action", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, actionSchema);
  const ctx = reqContext(req);
  const actor = { actorId: userId, actorRole: "customer", ip: ctx.ip ?? undefined };

  const sub = await db.subscription.findFirst({ where: { id: body.id, userId }, select: { id: true, status: true } });
  if (!sub) throw Errors.notFound("Subscription not found.");

  // Dry-run preview — returns current vs proposed schedule WITHOUT committing (no audit, no reload).
  if (body.action === "preview_change") {
    const preview = await previewSubscriptionChange(sub.id, { cadence: body.cadence, quantity: body.qty });
    return ok({ preview });
  }

  switch (body.action) {
    case "pause": {
      const until = body.until ? new Date(body.until) : null;
      await db.subscription.update({ where: { id: sub.id }, data: { status: "VACATION", pausedFrom: new Date(), pausedUntil: until } });
      await removeScheduledDeliveries(sub.id, { from: new Date(), to: until ?? undefined }).catch(() => {});
      await logSubEvent(db, sub.id, "PAUSED", "Vacation paused", { until: until?.toISOString() ?? null }, actor);
      try { await notifySubscriptionPaused(userId, { until }); } catch { /* non-blocking */ }
      break;
    }
    case "resume": {
      await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", pausedFrom: null, pausedUntil: null } });
      await reconcileSchedule(sub.id).catch(() => null);          // refill + extend past the pause
      await logSubEvent(db, sub.id, "RESUMED", "Subscription resumed", undefined, actor);
      try { const nd = (await db.subscription.findUnique({ where: { id: sub.id }, select: { nextDeliveryAt: true } }))?.nextDeliveryAt ?? null; await notifySubscriptionResumed(userId, { nextDate: nd }); } catch { /* non-blocking */ }
      break;
    }
    case "change_frequency": {
      if (body.cadence == null) throw Errors.badRequest("Pick a delivery frequency.");
      await changeFrequency(sub.id, body.cadence, actor);         // self-serve: frequency (product stays admin-only)
      break;
    }
    case "change_quantity": {
      if (body.qty == null) throw Errors.badRequest("Pick a quantity per delivery.");
      await changeQuantity(sub.id, body.qty, actor);
      break;
    }
    case "skip":
    case "cancel_date": {
      const dates = body.dates ?? (body.date ? [body.date] : []);
      if (!dates.length) throw Errors.badRequest("Pick at least one delivery date.");
      await skipOrCancelDates(sub.id, dates, actor);             // marks SKIPPED + extends (make-up)
      break;
    }
    case "cancel": {
      // Customer cancels the whole plan. No auto-refund — the admin picks the
      // refund method later (the cancel dialog shows the suggested amount).
      await cancelSubscription(sub.id, { reason: body.reason }, actor);
      try { await cancelScheduledForSubscription(sub.id, actor); } catch { /* non-blocking */ }
      break;
    }
    case "autopay_on":
    case "autopay_off": {
      const on = body.action === "autopay_on";
      await db.subscription.update({ where: { id: sub.id }, data: { autoRenew: on } });
      await logSubEvent(db, sub.id, on ? "AUTOPAY_ON" : "AUTOPAY_OFF", on ? "Auto-renew enabled" : "Auto-renew disabled", undefined, actor);
      break;
    }
  }

  await audit({ userId, actorRole: "customer", action: `subscription.${body.action}`, target: sub.id, ctx });
  const subs = await loadSub(userId);
  const ownership = await ownershipLite(userId);
  return ok({ subscriptions: subs.map((s) => shape(s, ownership)) });
});
