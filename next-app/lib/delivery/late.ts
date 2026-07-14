/* =============================================================
   DOODLY — Late Delivery Monitoring (reuses Delivery + DeliveryConfig)
   Detects late deliveries against the configurable SLA promise time,
   computes delay + dashboard stats + per-executive performance, and
   records notify / escalate / resolve actions. No new delivery tables:
   escalations reuse DeliveryIssue; notify/resolve ride on AuditLog.
   ============================================================= */
import "server-only";
import type { IssueType, IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { istDayStart, istTodayBounds, istISO } from "@/lib/delivery/stats";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const CLOSED = ["DELIVERED", "FAILED", "SKIPPED"];
const parseHHMM = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || "07:00"); return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : 420; };
const istClock = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

async function sla() {
  const cfg = await db.deliveryConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  return { promiseTime: cfg.slaPromiseTime, graceMin: cfg.slaGraceMin, promiseMin: parseHHMM(cfg.slaPromiseTime) + cfg.slaGraceMin };
}

/** The configured SLA promise (minutes after IST midnight, incl. grace). */
export async function slaPromiseMin(): Promise<number> {
  return (await sla()).promiseMin;
}
/** True when a delivery met the SLA. "On time" means delivered BEFORE the promise instant
 *  of its own IST day — not merely "has a deliveredAt timestamp" (every DELIVERED row has
 *  one, which is why the drivers/routes dashboards could only ever report 100%). */
export function deliveredOnTime(deliveredAt: Date | null, date: Date, promiseMin: number): boolean {
  if (!deliveredAt) return false;
  return deliveredAt.getTime() <= istDayStart(date).getTime() + promiseMin * 60000;
}

export interface LateFilters { search?: string; exec?: string; status?: string; from?: string; to?: string }

export async function lateOverview(q: LateFilters = {}) {
  const s = await sla();
  const now = new Date();
  // IST-anchored windows. Deliveries are stamped at IST midnight, so setHours() (which
  // resolves in the process timezone — UTC on Vercel) lands on the wrong day and made
  // every open stop look late by ~18.5 h.
  const today = istTodayBounds();
  const windowStart = new Date(today.s.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db.delivery.findMany({
    where: { date: { gte: windowStart } },
    select: {
      id: true, date: true, status: true, deliveredAt: true, bottleCount: true, driverId: true, orderId: true, subscriptionId: true,
      driver: { select: { id: true, user: { select: { name: true } } } },
      route: { select: { name: true, zone: { select: { name: true } } } },
      subscription: { select: { user: { select: { id: true, name: true, phone: true } }, address: { select: { city: true, pincode: true } } } },
      order: { select: { user: { select: { id: true, name: true, phone: true } } } },
    },
    orderBy: { date: "desc" }, take: 500,
  });

  const items = rows.map((d) => {
    // The SLA promise is <promiseMin> minutes after IST midnight OF THE DELIVERY'S OWN DAY.
    const promise = new Date(istDayStart(d.date).getTime() + s.promiseMin * 60000);
    const cust = d.subscription?.user ?? d.order?.user ?? null;
    const addr = d.subscription?.address ?? null;
    let late = false, pending = false, delayMin = 0, statusLabel = "Scheduled";
    if (d.status === "DELIVERED") {
      delayMin = d.deliveredAt ? Math.max(0, Math.round((d.deliveredAt.getTime() - promise.getTime()) / 60000)) : 0;
      late = delayMin > 0; statusLabel = late ? "Late" : "On-Time";
    } else if (d.status === "FAILED" || d.status === "SKIPPED") {
      statusLabel = d.status === "FAILED" ? "Failed" : "Rescheduled";
    } else if (now > promise) {
      late = true; pending = true; delayMin = Math.round((now.getTime() - promise.getTime()) / 60000); statusLabel = "Pending · late";
    }
    return {
      id: d.id, orderId: d.orderId, subscriptionId: d.subscriptionId, date: istISO(d.date), status: d.status, statusLabel, late, pending, delayMin,
      customer: cust?.name ?? "—", customerId: cust?.id ?? "", mobile: cust?.phone ?? "",
      area: addr?.city ?? "—", pincode: addr?.pincode ?? "", route: d.route?.name ?? "—", zone: d.route?.zone?.name ?? "—",
      exec: d.driver?.user?.name ?? "—", execId: d.driverId ?? "",
      scheduled: s.promiseTime, actual: d.deliveredAt ? istClock(d.deliveredAt) : (pending ? "—" : ""),
      promiseAt: promise.toISOString(), deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
    };
  });

  const lateItems = items.filter((i) => i.late);
  const lateIds = lateItems.map((i) => i.id);

  // reuse DeliveryIssue (escalations) + AuditLog (notify/resolve) — no new tables
  const [issues, notes] = await Promise.all([
    lateIds.length ? db.deliveryIssue.findMany({ where: { deliveryId: { in: lateIds } }, select: { deliveryId: true } }) : Promise.resolve([]),
    lateIds.length ? db.auditLog.findMany({ where: { target: { in: lateIds }, action: { startsWith: "delivery.late." } }, select: { target: true, action: true } }) : Promise.resolve([]),
  ]);
  const escalatedSet = new Set(issues.map((i) => i.deliveryId));
  const notifiedSet = new Set(notes.filter((n) => n.action === "delivery.late.notify").map((n) => n.target));
  const resolvedSet = new Set(notes.filter((n) => n.action === "delivery.late.resolve").map((n) => n.target));
  for (const i of lateItems) {
    (i as Record<string, unknown>).escalated = escalatedSet.has(i.id);
    (i as Record<string, unknown>).notified = notifiedSet.has(i.id);
    (i as Record<string, unknown>).resolved = resolvedSet.has(i.id);
  }

  // filters
  let list = lateItems;
  if (q.search?.trim()) { const t = q.search.trim().toLowerCase(); list = list.filter((i) => [i.id, i.orderId, i.customer, i.customerId, i.mobile, i.exec, i.area, i.route].some((v) => (v ?? "").toLowerCase().includes(t))); }
  if (q.exec) list = list.filter((i) => i.exec === q.exec || i.execId === q.exec);
  if (q.status === "resolved") list = list.filter((i) => (i as Record<string, unknown>).resolved);
  if (q.status === "unresolved") list = list.filter((i) => !(i as Record<string, unknown>).resolved);
  if (q.status === "escalated") list = list.filter((i) => (i as Record<string, unknown>).escalated);

  // dashboard stats
  const todayItems = items.filter((i) => i.date === today.iso);   // i.date is the IST "YYYY-MM-DD"
  const deliveredLate = lateItems.filter((i) => !i.pending);
  const avgDelay = deliveredLate.length ? Math.round(deliveredLate.reduce((a, i) => a + i.delayMin, 0) / deliveredLate.length) : 0;
  const stats = {
    scheduledToday: todayItems.length,
    todayLate: todayItems.filter((i) => i.late).length,
    todayOnTime: todayItems.filter((i) => i.status === "DELIVERED" && !i.late).length,
    delayedBeyondSla: lateItems.length,
    avgDelayMin: avgDelay,
    execsWithLate: new Set(lateItems.filter((i) => i.execId).map((i) => i.execId)).size,
    customersWaiting: lateItems.filter((i) => i.pending).length,
    escalated: escalatedSet.size,
    rescheduled: items.filter((i) => i.status === "SKIPPED").length,
    onTimeRatePct: (() => { const done = items.filter((i) => i.status === "DELIVERED"); return done.length ? Math.round((done.filter((i) => !i.late).length / done.length) * 100) : 100; })(),
  };

  // per-executive performance
  const byExec = new Map<string, { execId: string; name: string; total: number; late: number; delays: number[] }>();
  for (const i of items) {
    if (!i.execId) continue;
    const e = byExec.get(i.execId) ?? { execId: i.execId, name: i.exec, total: 0, late: 0, delays: [] };
    if (i.status === "DELIVERED") { e.total++; if (i.late) { e.late++; e.delays.push(i.delayMin); } }
    byExec.set(i.execId, e);
  }
  const executives = [...byExec.values()].map((e) => ({
    execId: e.execId, name: e.name, total: e.total, late: e.late,
    onTime: e.total - e.late, onTimePct: e.total ? Math.round(((e.total - e.late) / e.total) * 100) : 100,
    avgDelayMin: e.delays.length ? Math.round(e.delays.reduce((a, b) => a + b, 0) / e.delays.length) : 0,
  })).sort((a, b) => b.late - a.late);

  return { sla: { promiseTime: s.promiseTime, graceMin: s.graceMin }, stats, items: list, executives };
}

// ---------------------------------------------------------------- actions
const ISSUE_FOR = (reason?: string): IssueType => "DELIVERY_FAILED";
export async function lateAction(deliveryId: string, action: "notify" | "escalate" | "resolve", input: { reason?: string; priority?: IssuePriority } = {}) {
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, driverId: true } });
  if (!d) throw Errors.notFound("Delivery not found.");
  if (action === "escalate" && d.driverId) {
    await db.deliveryIssue.create({ data: { deliveryId, driverId: d.driverId, type: ISSUE_FOR(input.reason), priority: input.priority ?? "HIGH", comments: input.reason?.trim() || "Late delivery escalated to Operations." } });
  }
  return { id: deliveryId, action };
}
