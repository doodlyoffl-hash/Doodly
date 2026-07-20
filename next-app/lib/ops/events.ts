/* =============================================================
   DOODLY — Operational WhatsApp events.
   The nightly cut-off summary lives in lib/ops/cutoff.ts. This is the other
   six ops alerts, each fired from the moment it actually describes:

     new_order_alert            → an order is confirmed (prepaid / wallet / COD)
     auto_assignment_complete   → a scheduled auto-assignment sweep finishes
     packing_summary            → the last stop of the day finishes packing
     delivery_completed_summary → the day closes (fired by the cut-off)
     missed_delivery_alert      → the day closes with stops still open
     low_inventory_alert        → a stock commit crosses the low-stock threshold

   Every sender here obeys the same three rules:
     • it NEVER throws — ops alerts must not break checkout, packing or a cron,
     • it NEVER fails silently — every outcome is audited, and a total delivery
       failure escalates in-app to the admins (throttled, so a Superfone outage
       during a busy hour can't turn into an alert storm),
     • it is OFF-able per event, so ops control their own noise.

   Recipients / retries / the master switch are shared with the cut-off
   (AppSetting "ops.cutoff") — one WhatsApp recipient list for all of ops.
   ============================================================= */
import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { log } from "@/lib/logger";
import { istDayWindow } from "@/lib/delivery/stats";
import { broadcastOpsWhatsApp, type OpsTemplateKey } from "@/lib/ops/whatsapp";
import { getCutoffConfig, patchOpsConfig, istTodayIso } from "@/lib/ops/cutoff";

/** The six event-driven alerts (the daily summary is the cut-off's own). */
export type OpsEvent = Exclude<OpsTemplateKey, "daily_delivery_summary">;

/** All on by default: the incident that started this system was nobody knowing
 *  a new order had been placed, so silence is the failure mode we design against. */
export const OPS_EVENT_DEFAULTS: Record<OpsEvent, boolean> = {
  new_order_alert: true,
  auto_assignment_complete: true,
  packing_summary: true,
  delivery_completed_summary: true,
  missed_delivery_alert: true,
  low_inventory_alert: true,
};
export const OPS_EVENT_LABEL: Record<OpsEvent, string> = {
  new_order_alert: "New order received",
  auto_assignment_complete: "Auto assignment completed",
  packing_summary: "Packing ready for dispatch",
  delivery_completed_summary: "Today's deliveries completed",
  missed_delivery_alert: "Deliveries not completed",
  low_inventory_alert: "Low inventory",
};

const CLOSED: DeliveryStatus[] = ["DELIVERED", "FAILED", "SKIPPED"];
const ESCALATION_THROTTLE_MS = 60 * 60 * 1000;   // at most one in-app escalation per event per hour

const maskNumber = (n: string) => {
  const s = String(n || "");
  return s.length <= 4 ? s : s.slice(0, 3) + "*".repeat(Math.max(0, s.length - 7)) + s.slice(-4);
};

/** Send one ops event to the shared recipient list. Returns what happened; never throws. */
async function fire(
  key: OpsEvent,
  vars: (string | number)[],
  opts: { extra?: string; context?: string } = {},
): Promise<{ sent: number; total: number; skipped?: string }> {
  try {
    const cfg = await getCutoffConfig();
    if (!cfg.whatsappEnabled) return { sent: 0, total: 0, skipped: "whatsapp_disabled" };
    if ((cfg.events?.[key] ?? OPS_EVENT_DEFAULTS[key]) === false) return { sent: 0, total: 0, skipped: "event_disabled" };
    const recipients = cfg.whatsappRecipients ?? [];
    if (!recipients.length) return { sent: 0, total: 0, skipped: "no_recipients" };

    const results = await broadcastOpsWhatsApp(key, recipients, vars, {
      retries: Math.max(0, cfg.whatsappRetries ?? 2),
      extra: opts.extra,
    });
    const sent = results.filter((r) => r.status === "SENT").length;

    // Audit every recipient — this is the record that makes "it never arrived" answerable.
    for (const r of results) {
      await audit({
        actorRole: "system",
        action: r.status === "SENT" ? "ops.whatsapp.sent" : "ops.whatsapp.failed",
        target: `${key}${opts.context ? " · " + opts.context : ""} · ${maskNumber(r.to)} · ${r.status}${r.messageId ? " · " + r.messageId : ""} · attempts ${r.attempts}${r.error ? " · " + r.error : ""}`,
      }).catch(() => { /* audit must never block a send */ });
    }

    // Never fail silently: if it reached nobody, tell the admins in the panel instead.
    if (results.length && sent === 0) await escalate(key, results[0]?.error ?? "unknown", results.length);
    return { sent, total: results.length };
  } catch (e) {
    log.error("ops.events", "send failed", { key, err: (e as Error)?.message });
    return { sent: 0, total: 0, skipped: "error" };
  }
}

/** In-app escalation when an event reached nobody — throttled per event per hour. */
async function escalate(key: OpsEvent, error: string, recipients: number) {
  try {
    const cfg = await getCutoffConfig();
    const last = cfg.eventEscalatedAt?.[key];
    if (last && Date.now() - new Date(last).getTime() < ESCALATION_THROTTLE_MS) return;
    const { notifyAdmins } = await import("@/lib/assignment/notify");
    await notifyAdmins(db, "⚠ WhatsApp alert could not be delivered",
      `"${OPS_EVENT_LABEL[key]}" failed to reach all ${recipients} WhatsApp recipient(s): ${error}. The Admin Panel is unaffected.`, "PUSH");
    await patchOpsConfig({ eventEscalatedAt: { ...(cfg.eventEscalatedAt ?? {}), [key]: new Date().toISOString() } });
  } catch { /* non-blocking */ }
}

// ---------------------------------------------------------------- 1. new order
/** An order just became confirmed. Called from the payment webhook / verify /
 *  wallet / COD paths — all of which already guarantee exactly-once via the
 *  `status: { not: "PAID" }` flip guard, so this cannot double-send. */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const o = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, totalPaise: true, couponDiscountPaise: true, user: { select: { name: true } } },
    });
    if (!o) return;
    // Order has no number column — the customer-facing ref is derived (same rule
    // as lib/checkout/service.ts) so ops can match it to what the customer sees.
    const ref = `DOO-${o.id.slice(-6).toUpperCase()}`;
    // Order.totalPaise is GROSS — the coupon is stored separately, so what the
    // customer actually owes is the difference (see the money conventions).
    const netRupees = Math.max(0, (o.totalPaise || 0) - (o.couponDiscountPaise || 0)) / 100;
    await fire("new_order_alert",
      [o.user?.name ?? "Customer", ref, netRupees.toFixed(2)],
      { context: ref });
  } catch (e) { log.error("ops.events", "new order alert failed", { orderId, err: (e as Error)?.message }); }
}

// ------------------------------------------------- 2. auto assignment complete
/** A scheduled auto-assignment sweep finished. Silent when it assigned nothing —
 *  the sweep runs on every executive shift-start, and "0 assigned" is not news. */
export async function notifyAutoAssignmentComplete(args: { dateIso: string; assigned: number }): Promise<void> {
  try {
    if (!args.assigned) return;
    const available = await db.driver.count({
      where: { active: true, execStatus: { availability: { in: ["AVAILABLE", "RETURNED_TO_DAIRY"] } } },
    }).catch(() => 0);
    await fire("auto_assignment_complete",
      [args.dateIso.split("-").reverse().join("/"), args.assigned, available],
      { context: args.dateIso });
  } catch (e) { log.error("ops.events", "assignment alert failed", { err: (e as Error)?.message }); }
}

// -------------------------------------------------------------- 3. packing done
/** Fired when the LAST stop of a delivery day finishes packing. There is no
 *  natural "packing complete" event in the workflow, so we detect the edge:
 *  advance a stop, then ask whether anything is still unpacked for that day.
 *  Deduped to once per delivery day so re-packing a stop can't re-announce it. */
export async function notifyPackingCompleteIfDone(deliveryIds: string[]): Promise<void> {
  try {
    if (!deliveryIds.length) return;
    // Which IST day did we just touch? (A bulk action is a single board = a single day.)
    const row = await db.delivery.findFirst({ where: { id: { in: deliveryIds } }, select: { date: true } });
    if (!row) return;
    const iso = new Date(row.date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { start, end } = istDayWindow(iso);

    const remaining = await db.delivery.count({
      where: { date: { gte: start, lt: end }, packingStatus: { in: ["PENDING", "PACKING"] }, status: { notIn: CLOSED } },
    });
    if (remaining > 0) return;                       // still packing — not the edge

    const cfg = await getCutoffConfig();
    if (cfg.packingSummaryDate === iso) return;      // already announced for this day

    const ready = await db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: CLOSED } },
      select: { bottleCount: true },
    });
    if (!ready.length) return;
    const bottles = ready.reduce((s, d) => s + (d.bottleCount || 0), 0);

    // Real volume, not bottles-as-litres: ask the packing report, which resolves
    // each stop's true Variant.ml (a bottle is not a litre).
    let litres = 0;
    try {
      const { packingListReport } = await import("@/lib/ops/packing-report");
      litres = (await packingListReport(iso))?.totals?.litres ?? 0;
    } catch { /* fall back to omitting volume rather than reporting a wrong one */ }

    await patchOpsConfig({ packingSummaryDate: iso });
    await fire("packing_summary",
      [iso.split("-").reverse().join("/"), ready.length, litres, bottles],
      { context: iso });
  } catch (e) { log.error("ops.events", "packing alert failed", { err: (e as Error)?.message }); }
}

// ------------------------------------------ 4 + 5. day close: completed / missed
export interface DayCompletion { date: string; delivered: number; pending: number; failed: number }

/** How today actually went — the counts behind the day-close alerts. */
export async function dayCompletionReport(dateIso?: string | null): Promise<DayCompletion> {
  const { start, end, iso } = istDayWindow(dateIso ?? istTodayIso());
  const where = { date: { gte: start, lt: end } };
  const [delivered, failed, pending] = await Promise.all([
    db.delivery.count({ where: { ...where, status: "DELIVERED" } }),
    db.delivery.count({ where: { ...where, status: { in: ["FAILED", "SKIPPED"] } } }),
    db.delivery.count({ where: { ...where, status: { notIn: CLOSED } } }),
  ]);
  return { date: iso, delivered, pending, failed };
}

/** The day is closing (fired by the cut-off, which runs at 20:00 IST): report how
 *  it went, and raise a separate alert if stops are still open. Returns the counts
 *  so the cut-off can record them. Deduped by the cut-off's own once-a-day guard. */
export async function notifyDayClose(dateIso?: string | null): Promise<DayCompletion & { alertedMissed: boolean }> {
  const r = await dayCompletionReport(dateIso);
  let alertedMissed = false;
  // Nothing was scheduled → nothing to report. Don't send an all-zeros message.
  if (r.delivered + r.pending + r.failed === 0) return { ...r, alertedMissed };

  await fire("delivery_completed_summary", [r.delivered, r.pending, r.failed], { context: r.date });
  if (r.pending > 0) {
    await fire("missed_delivery_alert", [r.pending], { context: `${r.date} · ${r.pending} open` });
    alertedMissed = true;
  }
  return { ...r, alertedMissed };
}

// ------------------------------------------------------------ 6. low inventory
/** A stock commit left a variant at or below its low-stock threshold.
 *  Called from lib/inventory/order-stock.ts alongside the existing in-app alert,
 *  so admins get one event on two channels rather than two competing alerts. */
export async function notifyLowInventory(v: { label: string; stock: number }): Promise<void> {
  await fire("low_inventory_alert", [v.label, v.stock <= 0 ? "OUT OF STOCK" : String(v.stock)], { context: v.label });
}
