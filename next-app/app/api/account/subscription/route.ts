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
import { cancelSubscription, logSubEvent } from "@/lib/subscriptions/admin";
import { skipOrCancelDates, removeScheduledDeliveries, reconcileSchedule } from "@/lib/subscriptions/deliveries";

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

function shape(s: NonNullable<SubWith>[number]) {
  const perDeliveryPaise = s.items.reduce((sum, i) => sum + i.qty * (i.variant.dailyPaise ?? 0), 0);
  return {
    id: s.id, status: s.status, startDate: s.startDate, endDate: s.endDate,
    nextDeliveryAt: s.nextDeliveryAt, deliverySlot: s.deliverySlot, autoRenew: s.autoRenew,
    pausedFrom: s.pausedFrom, pausedUntil: s.pausedUntil, skipDates: s.skipDates, targetDeliveries: s.targetDeliveries,
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
  return ok({ subscriptions: subs.map(shape) });
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume", "cancel", "skip", "cancel_date", "autopay_on", "autopay_off"]),
  until: z.string().datetime().optional(),               // pause: vacation end
  date: z.string().datetime().optional(),                // skip: one delivery date
  dates: z.array(z.string().datetime()).min(1).max(60).optional(), // cancel_date: many
  reason: z.string().max(300).optional(),                // cancel reason
});

export const POST = route("account.subscription.action", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, actionSchema);
  const ctx = reqContext(req);
  const actor = { actorId: userId, actorRole: "customer", ip: ctx.ip ?? undefined };

  const sub = await db.subscription.findFirst({ where: { id: body.id, userId }, select: { id: true, status: true } });
  if (!sub) throw Errors.notFound("Subscription not found.");

  switch (body.action) {
    case "pause": {
      const until = body.until ? new Date(body.until) : null;
      await db.subscription.update({ where: { id: sub.id }, data: { status: "VACATION", pausedFrom: new Date(), pausedUntil: until } });
      await removeScheduledDeliveries(sub.id, { from: new Date(), to: until ?? undefined }).catch(() => {});
      await logSubEvent(db, sub.id, "PAUSED", "Vacation paused", { until: until?.toISOString() ?? null }, actor);
      break;
    }
    case "resume": {
      await db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", pausedFrom: null, pausedUntil: null } });
      await reconcileSchedule(sub.id).catch(() => null);          // refill + extend past the pause
      await logSubEvent(db, sub.id, "RESUMED", "Subscription resumed", undefined, actor);
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
  return ok({ subscriptions: subs.map(shape) });
});
