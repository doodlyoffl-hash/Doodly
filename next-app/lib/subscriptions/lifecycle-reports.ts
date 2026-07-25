/* =============================================================
   DOODLY — Subscription lifecycle reports.
   Cancelled / adjusted / extended / operational-failure / customer-requested
   activity over an IST date range. Returns the same normalized table shape as
   the milk reports, so the existing CSV / XLS / PDF renderers cover every type.
   Sourced from Delivery (SKIPPED/FAILED + adjustReason) and SubscriptionEvent.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { reasonLabel } from "./reasons";
import type { MilkReport } from "@/lib/milk/reports";

export type LifecycleReportType = "cancelled" | "adjusted" | "extended" | "operational" | "customer_requested";
export const LIFECYCLE_REPORT_TYPES: LifecycleReportType[] = ["cancelled", "adjusted", "extended", "operational", "customer_requested"];

const OPS_FAULT = ["OPS_MISSED", "EXECUTIVE_ISSUE", "VEHICLE_BREAKDOWN", "WEATHER", "STOCK_UNAVAILABLE", "QUALITY_ISSUE"];
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dmy = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };
const fmt = (d?: Date | null) => (d ? istDate(d) : "");

/** Build one lifecycle report over an IST range [from,to] inclusive (YYYY-MM-DD). */
export async function buildLifecycleReport(type: LifecycleReportType, fromIso: string, toIso: string): Promise<MilkReport> {
  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;
  const range = `${dmy(fromIso)} — ${dmy(toIso)}`;
  const stamp = `Generated ${new Date().toLocaleString("en-IN")}`;
  const t = type as unknown as MilkReport["type"]; // shape-compatible; only used for the filename

  // ---- delivery-sourced reports (cancelled / adjusted / operational) ----
  if (type === "cancelled" || type === "adjusted" || type === "operational") {
    const status = type === "cancelled" ? "SKIPPED" as const : "FAILED" as const;
    const dels = await db.delivery.findMany({
      where: { status, adjustReason: { not: null }, date: { gte: start, lt: end }, subscriptionId: { not: null }, ...(type === "operational" ? { adjustReason: { in: OPS_FAULT } } : {}) },
      orderBy: { date: "asc" },
      select: { date: true, adjustReason: true, adjustNote: true, subscription: { select: { plan: { select: { name: true } }, user: { select: { name: true, email: true } } } } },
    });
    const rows = dels.map((d) => [istDate(d.date), d.subscription?.user.name || d.subscription?.user.email || "—", d.subscription?.plan.name || "—", reasonLabel(d.adjustReason), d.adjustNote || ""]);
    const title = type === "cancelled" ? "Cancelled Deliveries" : type === "operational" ? "Operational Delivery Failures" : "Adjusted (Missed) Deliveries";
    return {
      type: t, title, subtitle: `${range} · ${dels.length} record(s) · ${stamp}`, rowCount: dels.length,
      columns: [{ label: "Date" }, { label: "Customer" }, { label: "Plan" }, { label: "Reason" }, { label: "Note" }],
      rows, totalRow: ["TOTAL", String(dels.length), "", "", ""],
    };
  }

  // ---- event-sourced reports (extended / customer_requested) ----
  const evTypes = type === "extended" ? ["EXTENDED", "ADJUSTED", "DATE_CANCELLED"] : ["DATE_CANCELLED"];
  const events = await db.subscriptionEvent.findMany({
    where: { type: { in: evTypes }, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: { type: true, summary: true, detail: true, createdAt: true, subscription: { select: { plan: { select: { name: true } }, user: { select: { name: true, email: true } } } } },
  });
  const detOf = (d: unknown) => (d && typeof d === "object" ? d as Record<string, unknown> : {});
  if (type === "extended") {
    const rows = events.map((e) => { const d = detOf(e.detail); return [istDate(e.createdAt), e.subscription?.user.name || e.subscription?.user.email || "—", e.subscription?.plan.name || "—", fmt(d.oldEndDate ? new Date(d.oldEndDate as string) : null), fmt(d.newEndDate ? new Date(d.newEndDate as string) : null), e.type]; });
    return {
      type: t, title: "Extended Subscriptions", subtitle: `${range} · ${events.length} extension event(s) · ${stamp}`, rowCount: events.length,
      columns: [{ label: "Date" }, { label: "Customer" }, { label: "Plan" }, { label: "Old end" }, { label: "New end" }, { label: "Trigger" }],
      rows, totalRow: ["TOTAL", String(events.length), "", "", "", ""],
    };
  }
  // customer_requested
  const rows = events.map((e) => { const d = detOf(e.detail); const dates = Array.isArray(d.dates) ? (d.dates as string[]).map((x) => istDate(new Date(x))).join(", ") : ""; return [istDate(e.createdAt), e.subscription?.user.name || e.subscription?.user.email || "—", e.subscription?.plan.name || "—", dates, fmt(d.newEndDate ? new Date(d.newEndDate as string) : null)]; });
  return {
    type: t, title: "Customer-Requested Changes", subtitle: `${range} · ${events.length} request(s) · ${stamp}`, rowCount: events.length,
    columns: [{ label: "Date" }, { label: "Customer" }, { label: "Plan" }, { label: "Dates cancelled" }, { label: "New end" }],
    rows, totalRow: ["TOTAL", String(events.length), "", "", ""],
  };
}
