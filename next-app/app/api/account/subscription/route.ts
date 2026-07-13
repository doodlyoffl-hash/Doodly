/* /api/account/subscription — the signed-in customer's subscriptions.
   GET  — list with plan, address, items and per-delivery price.
   POST — lifecycle actions on one of the user's own subscriptions:
          pause (Vacation Mode), resume, cancel, skip (next delivery). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { applyDueForSubscription, cancelScheduledForSubscription } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subInclude = {
  plan: { select: { name: true, days: true, discountBps: true } },
  address: { select: { label: true, line1: true, line2: true, city: true, pincode: true } },
  items: { include: { variant: { select: { label: true, ml: true, dailyPaise: true, product: { select: { name: true } } } } } },
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
    pausedFrom: s.pausedFrom, pausedUntil: s.pausedUntil, skipDates: s.skipDates,
    plan: s.plan, address: s.address, perDeliveryPaise,
    items: s.items.map((i) => ({ qty: i.qty, label: i.variant.label, ml: i.variant.ml, product: i.variant.product.name, dailyPaise: i.variant.dailyPaise })),
  };
}

export const GET = route("account.subscription.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  // Lazy safety-net: apply any address change whose effective date has arrived
  // (so the address is never stale even if the daily cron didn't run).
  const own = await db.subscription.findMany({ where: { userId }, select: { id: true } });
  for (const s of own) { try { await applyDueForSubscription(s.id); } catch { /* non-blocking */ } }
  const subs = await loadSub(userId);
  return ok({ subscriptions: subs.map(shape) });
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume", "cancel", "skip", "autopay_on", "autopay_off"]),
  until: z.string().datetime().optional(),  // pause: vacation end
  date: z.string().datetime().optional(),   // skip: which delivery date
});

export const POST = route("account.subscription.action", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, actionSchema);

  const sub = await db.subscription.findFirst({ where: { id: body.id, userId } });
  if (!sub) throw Errors.notFound("Subscription not found.");

  let data: Record<string, unknown> = {};
  switch (body.action) {
    case "pause":
      data = { status: "VACATION", pausedFrom: new Date(), pausedUntil: body.until ? new Date(body.until) : null };
      break;
    case "resume":
      data = { status: "ACTIVE", pausedFrom: null, pausedUntil: null };
      break;
    case "cancel":
      data = { status: "CANCELLED", endDate: new Date(), autoRenew: false };
      break;
    case "skip": {
      const when = body.date ? new Date(body.date) : sub.nextDeliveryAt;
      if (!when) throw Errors.badRequest("No upcoming delivery to skip.");
      data = { skipDates: { push: when } };
      break;
    }
    case "autopay_on":
      data = { autoRenew: true };
      break;
    case "autopay_off":
      data = { autoRenew: false };
      break;
  }

  await db.subscription.update({ where: { id: sub.id }, data });
  // Cancelling the subscription voids any not-yet-applied address change on it.
  if (body.action === "cancel") {
    try { await cancelScheduledForSubscription(sub.id, { actorId: userId, actorRole: "customer", ip: reqContext(req).ip ?? undefined }); } catch { /* non-blocking */ }
  }
  await audit({ userId, actorRole: "customer", action: `subscription.${body.action}`, target: sub.id, ctx: reqContext(req) });

  const subs = await loadSub(userId);
  return ok({ subscriptions: subs.map(shape) });
});
