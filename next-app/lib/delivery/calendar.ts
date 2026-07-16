/* =============================================================
   DOODLY — Delivery Calendar (admin, per IST month).
   One row per IST calendar day: total / assigned / pending / completed / failed
   deliveries + bottles and real milk volume. Powers the month grid, and each day
   links straight into the date-based Delivery Management board.
   Uses the same IST day boundaries as every other board (lib/delivery/stats.ts),
   so a day here always matches what that date shows.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";

const ASSIGNED_SET = ["ASSIGNED", "ACCEPTED", "PACKED"];
const OUT_SET = ["OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

export interface CalendarDay {
  date: string;          // IST "YYYY-MM-DD"
  total: number;
  pending: number;       // SCHEDULED (not yet assigned to anyone)
  assigned: number;      // assigned / accepted / packed
  outForDelivery: number;
  completed: number;     // DELIVERED
  failed: number;        // FAILED / SKIPPED
  unassigned: number;    // SCHEDULED with no driver — the ones that need action
  bottles: number;
  litres: number;
}
export interface CalendarMonth {
  month: string;         // "YYYY-MM"
  days: CalendarDay[];   // only days that HAVE deliveries
  totals: { total: number; pending: number; assigned: number; outForDelivery: number; completed: number; failed: number; unassigned: number; bottles: number; litres: number };
}

/** `month` = "YYYY-MM" (IST). Defaults to the current IST month. */
export async function deliveryCalendar(month?: string | null): Promise<CalendarMonth> {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : istISO(new Date()).slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  // IST month bounds → the first instant of day 1 and the first instant of the next month's day 1.
  const start = istDayWindow(`${m}-01`).start;
  const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const end = istDayWindow(nextMonth).start;

  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        date: true, status: true, driverId: true, bottleCount: true,
        subscription: { select: { items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        order: { select: { items: { select: { productSlug: true, variantLabel: true } } } },
      },
      take: 10000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);

  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);

  const blank = (date: string): CalendarDay => ({ date, total: 0, pending: 0, assigned: 0, outForDelivery: 0, completed: 0, failed: 0, unassigned: 0, bottles: 0, litres: 0 });
  const byDay = new Map<string, CalendarDay & { _ml: number }>();

  for (const d of rows) {
    const iso = istISO(d.date);
    const cur = byDay.get(iso) ?? { ...blank(iso), _ml: 0 };
    cur.total++;
    if (d.status === "SCHEDULED") { cur.pending++; if (!d.driverId) cur.unassigned++; }
    else if (ASSIGNED_SET.includes(d.status)) cur.assigned++;
    else if (OUT_SET.includes(d.status)) cur.outForDelivery++;
    else if (d.status === "DELIVERED") cur.completed++;
    else if (d.status === "FAILED" || d.status === "SKIPPED") cur.failed++;
    cur.bottles += d.bottleCount || 0;

    // real volume: bottles on the stop x the bottle size (never bottles-as-litres)
    const subItems = d.subscription?.items ?? [];
    if (subItems.length) cur._ml += subItems.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0);
    else {
      const oi = (d.order?.items ?? [])[0];
      const ml = oi ? (mlByKey.get(`${oi.productSlug}|${normLabel(oi.variantLabel)}`) ?? 1000) : 1000;
      cur._ml += ml * (d.bottleCount || 1);
    }
    byDay.set(iso, cur);
  }

  const days: CalendarDay[] = [...byDay.values()]
    .map(({ _ml, ...day }) => ({ ...day, litres: Math.round((_ml / 1000) * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = days.reduce((t, d) => ({
    total: t.total + d.total, pending: t.pending + d.pending, assigned: t.assigned + d.assigned,
    outForDelivery: t.outForDelivery + d.outForDelivery, completed: t.completed + d.completed,
    failed: t.failed + d.failed, unassigned: t.unassigned + d.unassigned, bottles: t.bottles + d.bottles,
    litres: Math.round((t.litres + d.litres) * 100) / 100,
  }), { total: 0, pending: 0, assigned: 0, outForDelivery: 0, completed: 0, failed: 0, unassigned: 0, bottles: 0, litres: 0 });

  return { month: m, days, totals };
}
