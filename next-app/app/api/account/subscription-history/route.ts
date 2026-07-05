/* /api/account/subscription-history — the signed-in customer's plan timeline.
   Combines each subscription's derived lifecycle (started / paused / cancelled /
   active) with any explicit SubscriptionEvent rows (renewals, cashback, refunds,
   reschedules), newest first. Never fabricated — empty when they've never
   subscribed, so the client shows an honest empty state. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ev = { ts: number; type: string; title: string; sub: string };

export const GET = route("account.subscription.history", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const subs = await db.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { name: true } },
      items: { include: { variant: { select: { dailyPaise: true } } } },
    },
  });

  const out: Ev[] = [];
  const planOf = new Map<string, string>();
  for (const s of subs) {
    const plan = s.plan?.name ?? "Subscription";
    planOf.set(s.id, plan);
    const perDelivery = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
    const price = perDelivery ? `₹${Math.round(perDelivery / 100)} / delivery` : "";
    if (s.startDate) out.push({ ts: +new Date(s.startDate), type: "started", title: `Started — ${plan}`, sub: price });
    if (s.status === "CANCELLED" && s.endDate) out.push({ ts: +new Date(s.endDate), type: "cancelled", title: `Cancelled — ${plan}`, sub: "" });
    if (s.status === "VACATION" && s.pausedFrom) out.push({ ts: +new Date(s.pausedFrom), type: "paused", title: `Paused — ${plan}`, sub: "" });
    if (s.status === "ACTIVE") out.push({ ts: Date.now(), type: "active", title: `Active — ${plan}`, sub: s.nextDeliveryAt ? `Next delivery ${new Date(s.nextDeliveryAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "Ongoing" });
  }

  // Explicit lifecycle events we don't already derive above (renewals, money movements, reschedules).
  const subIds = subs.map((s) => s.id);
  if (subIds.length) {
    const evs = await db.subscriptionEvent.findMany({
      where: { subscriptionId: { in: subIds }, type: { in: ["RENEWED", "RESUMED", "RESCHEDULED", "CASHBACK", "REFUND"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    for (const e of evs) {
      out.push({ ts: +new Date(e.createdAt), type: e.type.toLowerCase(), title: e.summary, sub: planOf.get(e.subscriptionId) ?? "" });
    }
  }

  out.sort((a, b) => b.ts - a.ts);
  return ok({ events: out.map((e) => ({ type: e.type, title: e.title, sub: e.sub, at: new Date(e.ts).toISOString() })) });
});
