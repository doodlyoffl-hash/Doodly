/* =============================================================
   DOODLY mobile — analytics facade.

   A provider-agnostic seam, NOT an SDK. The spec asks to track installs,
   active users, orders, conversions, retention and crashes; which
   concrete tool does that (Firebase, PostHog, Amplitude) is a business
   choice the DOODLY team makes later. Everything in the apps calls
   track()/screen()/identify() here, so swapping the backend is a
   one-file change instead of a hunt through 40 screens.

   Until a sink is registered, events are buffered (bounded) and, in dev,
   logged — so instrumentation can be written and reviewed now and the
   real tool wired in without touching a single screen.

   PRIVACY: never pass raw PII here (no phone, email, address). Use the
   user id and coarse properties. The facade does not enforce this — it's
   a rule for callers, restated at each call site's type.
   ============================================================= */

export type EventProps = Record<string, string | number | boolean | null | undefined>;

/** The shape any concrete analytics tool must implement to receive events. */
export interface AnalyticsSink {
  track(event: string, props?: EventProps): void;
  screen(name: string, props?: EventProps): void;
  identify(userId: string, traits?: EventProps): void;
  reset(): void;
}

interface BufferedEvent { kind: "track" | "screen" | "identify" | "reset"; name?: string; props?: EventProps; ts: number }

let sink: AnalyticsSink | null = null;
const buffer: BufferedEvent[] = [];
const MAX_BUFFER = 200;      // bounded — analytics must never grow memory unboundedly
let debug = false;

/** Register the real analytics tool. Any events captured before this call
 *  are flushed in order, so nothing from cold start is lost. */
export function initAnalytics(impl: AnalyticsSink, opts: { debug?: boolean } = {}): void {
  sink = impl;
  debug = !!opts.debug;
  for (const e of buffer) replay(e);
  buffer.length = 0;
}

/** Dev logging without a real sink, so instrumentation is visible while
 *  building. No-op in production when nothing is registered. */
export function enableAnalyticsDebug(on = true): void { debug = on; }

function push(e: BufferedEvent): void {
  if (sink) { replay(e); return; }
  if (debug) logEvent(e);
  buffer.push(e);
  if (buffer.length > MAX_BUFFER) buffer.shift();   // drop oldest
}

function replay(e: BufferedEvent): void {
  if (!sink) return;
  try {
    switch (e.kind) {
      case "track": sink.track(e.name!, e.props); break;
      case "screen": sink.screen(e.name!, e.props); break;
      case "identify": sink.identify(e.name!, e.props); break;
      case "reset": sink.reset(); break;
    }
  } catch { /* analytics must never break the app */ }
}

function logEvent(e: BufferedEvent): void {
  // eslint-disable-next-line no-console
  console.log(`[analytics] ${e.kind}${e.name ? ` ${e.name}` : ""}`, e.props ?? "");
}

function now(): number {
  // Date.now() is fine in the app runtime; only workflow scripts forbid it.
  return Date.now();
}

/** A product event. Name in snake_case, e.g. "order_placed". */
export function track(event: string, props?: EventProps): void {
  push({ kind: "track", name: event, props, ts: now() });
}

/** A screen view. Feeds active-users and funnel/retention analysis. */
export function screen(name: string, props?: EventProps): void {
  push({ kind: "screen", name, props, ts: now() });
}

/** Associate events with a user. Pass the DOODLY user id — NEVER phone or
 *  email. Traits should be coarse (role, tier), not identifying. */
export function identify(userId: string, traits?: EventProps): void {
  push({ kind: "identify", name: userId, props: traits, ts: now() });
}

/** Clear identity on sign-out so the next user's events aren't attributed
 *  to the previous one. */
export function resetAnalytics(): void {
  push({ kind: "reset", ts: now() });
}

/** The canonical event names, so screens don't drift on spelling. Add here,
 *  reference everywhere — a typo'd event name is invisible until reporting. */
export const Events = {
  appOpened: "app_opened",
  signedIn: "signed_in",
  signedOut: "signed_out",
  viewedProduct: "viewed_product",
  startedCheckout: "started_checkout",
  orderPlaced: "order_placed",
  paymentSucceeded: "payment_succeeded",
  paymentCancelled: "payment_cancelled",
  subscriptionChanged: "subscription_changed",
  walletViewed: "wallet_viewed",
  referralShared: "referral_shared",
  // Driver
  shiftStarted: "shift_started",
  stopUpdated: "stop_updated",
} as const;
