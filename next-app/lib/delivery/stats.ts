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

const IST_MS = 5.5 * 60 * 60 * 1000;
/** The [start,end) UTC bounds of a calendar day in IST (the business timezone).
 *  `dateStr` = "YYYY-MM-DD" (that IST day); omitted → today in IST. */
export function istDayWindow(dateStr?: string | null): { start: Date; end: Date; iso: string } {
  const ref = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + "T00:00:00Z") : new Date(Date.now() + IST_MS);
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth(), d = ref.getUTCDate();
  const startMs = Date.UTC(y, m, d) - IST_MS;
  const start = new Date(startMs), end = new Date(startMs + 24 * 60 * 60 * 1000);
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { start, end, iso };
}

/** IST midnight of the IST calendar day CONTAINING `d`, as a UTC instant. Use this to
 *  anchor an SLA promise time to a delivery's own day. Deliveries are stamped at IST
 *  midnight, so Date.prototype.setHours() (process-local = UTC on Vercel) lands on the
 *  wrong day and must never be used for this. */
export function istDayStart(d: Date): Date {
  const ist = new Date(d.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS);
}

/** Today's IST day as inclusive bounds `[s, e]` (e = 23:59:59.999 IST), matching the
 *  `gte/lte` filters used by the drivers / routes / pincodes dashboards. */
export function istTodayBounds(): { s: Date; e: Date; iso: string } {
  const { start, end, iso } = istDayWindow();
  return { s: start, e: new Date(end.getTime() - 1), iso };
}

/** The IST calendar date of an instant as "YYYY-MM-DD". (`toISOString().slice(0,10)`
 *  gives the UTC date, which is the PREVIOUS day for anything stamped at IST midnight.) */
export function istISO(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/* Volume helpers — "Milk required" must reflect the ACTUAL bottle sizes ordered
   (a 500 ml order is 0.5 L, not 1 L). Subscription items link straight to
   Variant.ml; OrderItem only stores a variantLabel string, so resolve it against
   the variant catalogue (falling back to parsing the label). */
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");
function parseMl(label?: string | null): number | null {
  const s = normLabel(label);
  let m = s.match(/^([\d.]+)ml$/);
  if (m) return Math.round(parseFloat(m[1]));
  m = s.match(/^([\d.]+)(?:l|ltr|litre|liter|litres|liters)$/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}

export async function deliveryStats(dateStr?: string | null) {
  const { start, end, iso } = istDayWindow(dateStr);
  const dayIsPast = end.getTime() <= Date.now();
  const [rows, drivers, zones, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        id: true, status: true, date: true, deliveredAt: true, bottleCount: true, bottlesIn: true, driverId: true,
        driver: { select: { id: true, rating: true, user: { select: { name: true } } } },
        route: { select: { zone: { select: { name: true } } } },
        subscription: { select: { items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        order: { select: { items: { select: { productSlug: true, variantLabel: true, quantity: true } } } },
      },
      orderBy: { date: "desc" }, take: 2000,
    }),
    db.driver.findMany({ where: { deletedAt: null }, select: { id: true, active: true, rating: true, user: { select: { name: true } } } }),
    db.deliveryZone.count(),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);

  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);
  const mlOfOrderItem = (slug: string, label: string | null) =>
    mlByKey.get(`${slug}|${normLabel(label)}`) ?? parseMl(label) ?? 1000;   // last resort: 1 L/bottle

  const cnt = (f: (r: (typeof rows)[number]) => boolean) => rows.reduce((a, r) => a + (f(r) ? 1 : 0), 0);
  const total = rows.length;
  const scheduled = cnt((r) => r.status === "SCHEDULED");
  const assigned = cnt((r) => ASSIGNED_SET.includes(r.status));
  const outForDelivery = cnt((r) => OUT_SET.includes(r.status));
  const delivered = cnt((r) => r.status === "DELIVERED");
  const failed = cnt((r) => r.status === "FAILED" || r.status === "SKIPPED");
  const pending = scheduled;
  const unassigned = cnt((r) => r.status === "SCHEDULED" && !r.driverId);
  // "delayed" = still-open deliveries on a day that's already fully past (in IST).
  const delayed = dayIsPast ? cnt((r) => !CLOSED_SET.includes(r.status)) : 0;

  const deliveredRows = rows.filter((r) => r.status === "DELIVERED");
  const bottlesCollected = rows.reduce((a, r) => a + (r.bottlesIn || 0), 0);
  // % of BOTTLES returned — the neighbouring KPIs (bottlesCollected/bottlesPending) are
  // bottle counts, so counting whole stops read "100% collected" when 1 of 10 came back.
  const bottlesPending = deliveredRows.reduce((a, r) => a + Math.max(0, (r.bottleCount || 0) - (r.bottlesIn || 0)), 0);
  const bottleCollectionPct = (bottlesCollected + bottlesPending) ? Math.round((bottlesCollected / (bottlesCollected + bottlesPending)) * 100) : 0;
  const totalBottles = rows.reduce((a, r) => a + (r.bottleCount || 0), 0);
  // Actual volume to dispatch THIS DAY: bottles on the stop × the bottle size.
  // Subscription items carry qty (bottles per delivery) + Variant.ml directly.
  // For a one-time order the per-delivery bottle count is Delivery.bottleCount —
  // NOT OrderItem.quantity, which is the order-level total (days × bottles).
  // Fall back to 1 L/bottle only when there's no item detail at all (legacy rows).
  const totalMl = rows.reduce((a, r) => {
    const subItems = r.subscription?.items ?? [];
    if (subItems.length) return a + subItems.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0);
    const oi = (r.order?.items ?? [])[0];
    if (oi) return a + mlOfOrderItem(oi.productSlug, oi.variantLabel) * (r.bottleCount || 1);
    return a + (r.bottleCount || 0) * 1000;
  }, 0);
  const milkLitres = Math.round((totalMl / 1000) * 100) / 100;
  // No `|| fleetSize` fallback: zero executives working is a real answer, not "unknown".
  const activeExecutives = new Set(rows.filter((r) => r.driverId).map((r) => r.driverId)).size;
  // Fleet rating over ACTIVE drivers — a soft-deleted/fired driver must not weigh it down.
  const ratedDrivers = drivers.filter((d) => d.active);
  const avgRating = ratedDrivers.length ? +(ratedDrivers.reduce((a, d) => a + (d.rating || 0), 0) / ratedDrivers.length).toFixed(1) : 0;
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
    date: iso,
    kpis: {
      total, scheduled, assigned, outForDelivery, delivered, failed, pending, unassigned, delayed,
      bottlesCollected, bottlesPending, bottleCollectionPct, activeExecutives, zones,
      totalBottles, milkLitres, avgRating, completionPct, avgTimeMin,
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
