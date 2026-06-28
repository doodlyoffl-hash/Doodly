/* =============================================================
   Live Order Status — PURE engine (no DB, no I/O). Fully tested.
   The single source of truth for customer-facing status copy, the
   visual 6-stage timeline, the real→banner status mapping, and the
   contextual action set. UI components render from here, so no
   status message is ever hardcoded in a component.
   ============================================================= */

// Canonical customer-facing statuses (superset of the operational
// DeliveryStatus; the service maps real state onto these).
export const LIVE_STATUSES = [
  "PENDING", "CONFIRMED", "SCHEDULED", "PREPARING", "QUALITY_CHECK", "PACKED",
  "ASSIGNED", "OUT_FOR_DELIVERY", "NEAR_DESTINATION", "DELIVERED",
  "FAILED", "RESCHEDULED", "CANCELLED",
] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

// The visual progress timeline (6 stages).
export const STAGES = ["CONFIRMED", "PREPARING", "QUALITY_CHECK", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  CONFIRMED: "Confirmed", PREPARING: "Preparing", QUALITY_CHECK: "Quality Check",
  PACKED: "Packed", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered",
};

const STAGE_INDEX: Record<LiveStatus, number> = {
  PENDING: 0, CONFIRMED: 0, SCHEDULED: 0, PREPARING: 1, QUALITY_CHECK: 2, PACKED: 3,
  ASSIGNED: 3, OUT_FOR_DELIVERY: 4, NEAR_DESTINATION: 4, DELIVERED: 5,
  FAILED: -1, RESCHEDULED: -1, CANCELLED: -1,
};
/** Index into STAGES for a status (-1 for exception states). */
export const stageIndexOf = (s: LiveStatus): number => STAGE_INDEX[s];

const TERMINAL: LiveStatus[] = ["DELIVERED", "FAILED", "CANCELLED"];
export const isTerminalStatus = (s: LiveStatus): boolean => TERMINAL.includes(s);
const EXCEPTION: LiveStatus[] = ["FAILED", "RESCHEDULED", "CANCELLED"];
export const isExceptionStatus = (s: LiveStatus): boolean => EXCEPTION.includes(s);
/** En-route states get live ETA / tracking treatment. */
export const isEnRoute = (s: LiveStatus): boolean => s === "OUT_FOR_DELIVERY" || s === "NEAR_DESTINATION";

/** Map the operational Delivery.status to a customer-facing LiveStatus. */
export function mapDeliveryStatus(deliveryStatus: string): LiveStatus {
  switch (deliveryStatus) {
    case "SCHEDULED": return "SCHEDULED";
    case "ASSIGNED":
    case "ACCEPTED": return "ASSIGNED";
    case "PACKED": return "PACKED";
    case "OUT_FOR_DELIVERY":
    case "ON_THE_WAY": return "OUT_FOR_DELIVERY";
    case "REACHED": return "NEAR_DESTINATION";
    case "DELIVERED": return "DELIVERED";
    case "FAILED": return "FAILED";
    case "SKIPPED": return "RESCHEDULED";
    default: return "CONFIRMED";
  }
}

// ---------- messages (templated from context; never hardcoded in UI) ----------

export interface StatusContext {
  slot?: string | null;        // "6:00 AM – 8:00 AM"
  etaMinutes?: number | null;  // estimated arrival
  whenLabel?: string | null;   // "today" | "tomorrow morning" | "on 02 Jul"
  driverName?: string | null;
}
export interface StatusMessage { emoji: string; title: string; subtitle?: string; tone: "info" | "active" | "success" | "warning" }

export function statusMessage(status: LiveStatus, ctx: StatusContext = {}): StatusMessage {
  const slot = ctx.slot?.trim() || null;
  switch (status) {
    case "PENDING":
      return { emoji: "📋", title: "Order received", subtitle: "We're confirming your order.", tone: "info" };
    case "CONFIRMED":
      return { emoji: "✅", title: "Your order has been confirmed.", subtitle: "We're preparing your fresh milk.", tone: "info" };
    case "SCHEDULED":
      return { emoji: "📅", title: `Your ${ctx.whenLabel || "next"} delivery is scheduled.`, subtitle: slot ? `Expected time: ${slot}` : undefined, tone: "info" };
    case "PREPARING":
      return { emoji: "🥛", title: "Your fresh milk is being prepared.", subtitle: "Collected fresh from our trusted farmers.", tone: "active" };
    case "QUALITY_CHECK":
      return { emoji: "🔬", title: "Quality check in progress.", subtitle: "Every batch is tested for purity.", tone: "active" };
    case "PACKED":
      return { emoji: "📦", title: "Packed and ready to go.", subtitle: "Sealed fresh in returnable glass.", tone: "active" };
    case "ASSIGNED":
      return { emoji: "🧑‍🌾", title: "Delivery executive assigned.", subtitle: ctx.driverName ? `${ctx.driverName} will deliver your order.` : "Your order is being dispatched.", tone: "active" };
    case "OUT_FOR_DELIVERY":
      return { emoji: "🚚", title: "Your order is on the way!", subtitle: ctx.etaMinutes ? `Estimated arrival: ${ctx.etaMinutes} minutes` : slot ? `Arriving in your slot: ${slot}` : "Arriving soon.", tone: "active" };
    case "NEAR_DESTINATION":
      return { emoji: "📍", title: "Your delivery is arriving in a few minutes.", subtitle: ctx.driverName ? `${ctx.driverName} is near your location.` : undefined, tone: "active" };
    case "DELIVERED":
      return { emoji: "🎉", title: "Delivered successfully!", subtitle: "Enjoy your fresh DOODLY dairy products.", tone: "success" };
    case "FAILED":
      return { emoji: "⚠️", title: "Delivery attempt unsuccessful.", subtitle: "We'll reach out to reschedule your delivery.", tone: "warning" };
    case "RESCHEDULED":
      return { emoji: "🗓️", title: "Your delivery has been rescheduled.", subtitle: slot ? `New slot: ${slot}` : "We'll confirm the new time shortly.", tone: "warning" };
    case "CANCELLED":
      return { emoji: "❌", title: "This order was cancelled.", subtitle: "Reorder anytime — fresh milk is one tap away.", tone: "warning" };
  }
}

// ---------- actions ----------

export type ActionKey = "TRACK" | "VIEW" | "DETAILS" | "SUPPORT" | "CONTACT_EXEC" | "RATE" | "REORDER" | "PAUSE";

export const ACTION_META: Record<ActionKey, { label: string; href: string; kind: "primary" | "secondary"; needsDriver?: boolean; needsSub?: boolean }> = {
  TRACK: { label: "Track Order", href: "/account/tracking", kind: "primary" },
  VIEW: { label: "View Order", href: "/account/orders", kind: "secondary" },
  DETAILS: { label: "View Details", href: "/account/orders", kind: "secondary" },
  SUPPORT: { label: "Contact Support", href: "/contact", kind: "secondary" },
  CONTACT_EXEC: { label: "Contact Executive", href: "/account/tracking", kind: "secondary", needsDriver: true },
  RATE: { label: "Rate Delivery", href: "/account/deliveries", kind: "primary" },
  REORDER: { label: "Reorder", href: "/subscriptions", kind: "secondary" },
  PAUSE: { label: "Pause Next Delivery", href: "/account/subscription", kind: "secondary", needsSub: true },
};

export function actionsFor(status: LiveStatus): ActionKey[] {
  switch (status) {
    case "DELIVERED": return ["RATE", "REORDER", "VIEW"];
    case "OUT_FOR_DELIVERY":
    case "NEAR_DESTINATION": return ["TRACK", "CONTACT_EXEC", "SUPPORT"];
    case "ASSIGNED":
    case "PACKED": return ["TRACK", "CONTACT_EXEC", "DETAILS"];
    case "FAILED":
    case "RESCHEDULED": return ["DETAILS", "SUPPORT"];
    case "CANCELLED": return ["REORDER", "SUPPORT"];
    default: return ["TRACK", "DETAILS", "PAUSE"];
  }
}

// ---------- small helpers (pure, tested) ----------

const DAY = 86_400_000;

/** Inclusive days remaining until `endDate` (0 if past / missing). Compared at
   local-midnight on both sides so it's whole-day exact regardless of timezone. */
export function daysRemaining(endDate: Date | string | null | undefined, now: Date = new Date()): number {
  if (!endDate) return 0;
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY));
}

/** Friendly label for a delivery date relative to `now`. */
export function whenLabel(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / DAY);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow morning";
  return `on ${new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
}

/** Soft ETA estimate (minutes) from a route stop sequence, when en route. */
export function etaFromSequence(sequence: number | null | undefined): number | undefined {
  if (sequence == null || sequence < 0) return undefined;
  return Math.min(75, Math.max(5, sequence * 5));
}
