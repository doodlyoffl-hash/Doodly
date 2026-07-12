/* =============================================================
   DOODLY — Razorpay server helpers (orders, recurring subscriptions,
   signature verification). SERVER ONLY — never import into a client
   component (it uses the secret key). Reads all credentials from env.
   ============================================================= */
import "server-only";
import Razorpay from "razorpay";
import crypto from "node:crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/* Lazily construct the client so importing this module never throws (the build's
   page-data collection imports route modules without runtime secrets). Keys are
   validated at call time — a missing-key request fails loudly, the build doesn't. */
let _client: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (!KEY_ID || !KEY_SECRET) throw new Error("Razorpay keys missing (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  if (!_client) _client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  return _client;
}

/** slug -> Razorpay plan_id map (created once in the Razorpay dashboard). */
export function planIdFor(planSlug: string): string | null {
  try {
    const map = JSON.parse(process.env.RAZORPAY_PLAN_IDS ?? "{}");
    return map[planSlug] ?? null;
  } catch {
    return null;
  }
}

/** One-time order (cart checkout / trial pack / wallet recharge). `amountPaise` already in paise. */
export async function createOrder(amountPaise: number, opts: { receipt: string; notes?: Record<string, string> }) {
  return getRazorpay().orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: opts.receipt,
    notes: opts.notes,
    payment_capture: true,
  });
}

/** Fetch an order back from Razorpay (server-trusted amount + notes). */
export async function fetchOrder(orderId: string) {
  return getRazorpay().orders.fetch(orderId);
}

/** True once gateway keys are configured — used to disable simulated money paths. */
export function razorpayConfigured(): boolean {
  return Boolean(KEY_ID && KEY_SECRET);
}

/** Recurring auto-pay mandate. `totalCount` = number of billing cycles. */
export async function createSubscription(planSlug: string, opts: { totalCount: number; customerNotify?: boolean; notes?: Record<string, string> }) {
  const planId = planIdFor(planSlug);
  if (!planId) throw new Error(`No Razorpay plan_id mapped for "${planSlug}" (set RAZORPAY_PLAN_IDS).`);
  return getRazorpay().subscriptions.create({
    plan_id: planId,
    total_count: opts.totalCount,
    customer_notify: opts.customerNotify === false ? 0 : 1,
    notes: opts.notes,
  } as any);
}

export async function cancelSubscription(subscriptionId: string, cancelAtCycleEnd = false) {
  return getRazorpay().subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

/** Pause a recurring mandate (holiday/vacation) without cancelling it. */
export async function pauseSubscription(subscriptionId: string) {
  return getRazorpay().subscriptions.pause(subscriptionId, { pause_at: "now" } as never);
}

/** Resume a paused/halted mandate → recurring charges continue (a HALTED mandate's
    resume re-attempts the failed cycle, so this doubles as customer/admin "retry"). */
export async function resumeSubscription(subscriptionId: string) {
  return getRazorpay().subscriptions.resume(subscriptionId, { resume_at: "now" } as never);
}

/** Fetch a mandate's live gateway state (status, current_end, paid_count, etc.). */
export async function fetchSubscription(subscriptionId: string) {
  return getRazorpay().subscriptions.fetch(subscriptionId);
}

/** Verify the signature returned by Checkout on success (order flow). */
export function verifyPaymentSignature(p: { orderId: string; paymentId: string; signature: string }): boolean {
  if (!KEY_SECRET) return false;
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(`${p.orderId}|${p.paymentId}`).digest("hex");
  return timingSafeEqual(expected, p.signature);
}

/** Verify a webhook payload (raw body string + X-Razorpay-Signature header). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
