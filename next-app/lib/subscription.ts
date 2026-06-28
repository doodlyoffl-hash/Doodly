/* =============================================================
   DOODLY — Subscription lifecycle rules
   Pure helpers used by Server Actions (pause/resume/skip/vacation)
   and by the nightly delivery-generation cron.
   ============================================================= */
import type { PricePlan } from "./pricing";

export type SubStatus = "ACTIVE" | "PAUSED" | "VACATION" | "CANCELLED" | "COMPLETED";

export interface Sub {
  status: SubStatus;
  startDate: Date;
  pausedFrom?: Date | null;
  pausedUntil?: Date | null;
  skipDates: Date[];
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Should a delivery be generated for `date`? Honors pause windows + skips. */
export function shouldDeliver(sub: Sub, date: Date): boolean {
  if (sub.status === "CANCELLED" || sub.status === "COMPLETED") return false;
  if (sub.skipDates.some((d) => sameDay(d, date))) return false;
  if (sub.pausedFrom && sub.pausedUntil && date >= sub.pausedFrom && date <= sub.pausedUntil) return false;
  if (sub.status === "PAUSED" || sub.status === "VACATION") return false;
  return date >= sub.startDate;
}

/** Days remaining in a plan from `from`, ignoring paused days (plan extends). */
export function effectiveEndDate(start: Date, plan: PricePlan): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + plan.days);
  return d;
}
