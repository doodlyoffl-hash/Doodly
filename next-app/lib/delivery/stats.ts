/* =============================================================
   DOODLY — Delivery Management dashboard stats + issue reporting
   Powers the admin Delivery Management overview (KPIs + per-executive
   performance) from live Delivery records, and lets staff log a
   DeliveryIssue against a delivery. Read-only aggregation + one writer.
   ============================================================= */
import "server-only";
import type { IssueType, IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const ASSIGNED_SET = ["ASSIGNED", "ACCEPTED", "PACKED"];
const OUT_SET = ["OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const CLOSED_SET = ["DELIVERED", "FAILED", "SKIPPED"];

export async function deliveryStats() {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const [rows, drivers, zones] = await Promise.all([
    db.delivery.findMany({
      select: {
        id: true, status: true, date: true, deliveredAt: true, bottleCount: true, bottlesIn: true, driverId: true,
        driver: { select: { id: true, rating: true, user: { select: { name: true } } } },
        route: { select: { zone: { select: { name: true } } } },
      },
      orderBy: { date: "desc" }, take: 500,
    }),
    db.driver.findMany({ select: { id: true, active: true, rating: true, user: { select: { name: true } } } }),
    db.deliveryZone.count(),
  ]);

  const cnt = (f: (r: (typeof rows)[number]) => boolean) => rows.reduce((a, r) => a + (f(r) ? 1 : 0), 0);
  const total = rows.length;
  const scheduled = cnt((r) => r.status === "SCHEDULED");
  const assigned = cnt((r) => ASSIGNED_SET.includes(r.status));
  const outForDelivery = cnt((r) => OUT_SET.includes(r.status));
  const delivered = cnt((r) => r.status === "DELIVERED");
  const failed = cnt((r) => r.status === "FAILED" || r.status === "SKIPPED");
  const pending = scheduled;
  const delayed = cnt((r) => r.date < startToday && !CLOSED_SET.includes(r.status));

  const deliveredRows = rows.filter((r) => r.status === "DELIVERED");
  const bottlesCollected = rows.reduce((a, r) => a + (r.bottlesIn || 0), 0);
  const collectedCount = deliveredRows.filter((r) => (r.bottlesIn || 0) > 0).length;
  const bottleCollectionPct = deliveredRows.length ? Math.round((collectedCount / deliveredRows.length) * 100) : 0;
  const bottlesPending = deliveredRows.reduce((a, r) => a + Math.max(0, (r.bottleCount || 0) - (r.bottlesIn || 0)), 0);
  const totalBottles = rows.reduce((a, r) => a + (r.bottleCount || 0), 0);
  const activeExecutives = new Set(rows.filter((r) => r.driverId).map((r) => r.driverId)).size || drivers.filter((d) => d.active).length;
  const avgRating = drivers.length ? +(drivers.reduce((a, d) => a + (d.rating || 0), 0) / drivers.length).toFixed(1) : 0;
  const completionPct = total ? Math.round((delivered / total) * 100) : 0;

  const mins = (r: (typeof rows)[number]) => r.deliveredAt ? (r.deliveredAt.getTime() - r.date.getTime()) / 60000 : NaN;
  const times = deliveredRows.map(mins).filter((m) => m > 0 && m < 600);
  const avgTimeMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  // per-executive performance
  const byDriver = new Map<string, { id: string; name: string; rating: number; zone: string; assigned: number; completed: number; times: number[] }>();
  for (const d of drivers) byDriver.set(d.id, { id: d.id, name: d.user.name ?? "—", rating: d.rating, zone: "—", assigned: 0, completed: 0, times: [] });
  for (const r of rows) {
    if (!r.driverId) continue;
    const e = byDriver.get(r.driverId); if (!e) continue;
    e.assigned++;
    if (r.status === "DELIVERED") { e.completed++; const m = mins(r); if (m > 0 && m < 600) e.times.push(m); }
    const zn = r.route?.zone?.name;
    if (zn && e.zone === "—") e.zone = zn;
  }
  const executives = [...byDriver.values()].filter((e) => e.assigned > 0).map((e) => ({
    id: e.id, name: e.name, zone: e.zone, assigned: e.assigned, completed: e.completed,
    avgTimeMin: e.times.length ? Math.round(e.times.reduce((a, b) => a + b, 0) / e.times.length) : null, rating: e.rating,
  }));

  return {
    kpis: {
      total, scheduled, assigned, outForDelivery, delivered, failed, pending, delayed,
      bottlesCollected, bottlesPending, bottleCollectionPct, activeExecutives, zones,
      totalBottles, milkLitres: totalBottles, avgRating, completionPct, avgTimeMin,
    },
    executives,
  };
}

// ---------------------------------------------------------------- issues
export async function listDeliveryIssues(deliveryId: string) {
  const issues = await db.deliveryIssue.findMany({
    where: { deliveryId }, orderBy: { createdAt: "desc" },
    select: { id: true, type: true, priority: true, comments: true, photoUrl: true, createdAt: true },
  });
  return issues.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }));
}

export async function reportDeliveryIssue(deliveryId: string, input: { type: IssueType; priority?: IssuePriority; comments?: string }, _actor: Actor) {
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, driverId: true } });
  if (!d) throw Errors.notFound("Delivery not found.");
  if (!d.driverId) throw Errors.badRequest("Assign a delivery executive before logging an issue.");
  const issue = await db.deliveryIssue.create({
    data: { deliveryId, driverId: d.driverId, type: input.type, priority: input.priority ?? "MEDIUM", comments: input.comments?.trim() || null },
    select: { id: true, type: true, priority: true, comments: true, createdAt: true },
  });
  return { ...issue, createdAt: issue.createdAt.toISOString() };
}
