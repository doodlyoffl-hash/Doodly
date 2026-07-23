/* =============================================================
   DOODLY mobile — checkout, orders, subscriptions, payments.

   PRICING IS SERVER-AUTHORITATIVE. The app never sends an amount: it
   sends WHAT was chosen (variant, plan, bottles, coupon, wallet
   contribution) and the backend prices it from config/catalogue.ts +
   lib/pricing.ts. Anything else would let a patched client set its own
   price. `quote()` exists purely to SHOW a total before committing.

   The Razorpay handoff is the one place the mobile app must differ from
   the website: the web injects checkout.js and calls
   `new window.Razorpay().open()`, which cannot run in React Native. The
   app uses the native SDK instead — but hits the SAME order/verify
   endpoints, so no payment logic is duplicated.
   ============================================================= */
import { api } from "./client";

/* -------------------------------------------------------------- checkout */

export interface CheckoutAddressInput {
  /** Use a saved address… */
  id?: string;
  /** …or supply a new one. line1 must be at least 4 characters — the
   *  server rejects shorter, which "A1" trips. */
  label?: string;
  line1?: string;
  city?: string;
  pincode?: string;
  contactName?: string;
  phone?: string;
}

export interface CheckoutInput {
  variantId: string;
  planId?: string;
  /** Bottles PER DELIVERY (1–20). Not total bottles across the plan. */
  bottles?: number;
  method?: "upi" | "card" | "netbanking" | "wallet";
  /** Recurring mandate. Subscription plans only — never trial packs. */
  autopay?: boolean;
  couponCode?: string;
  /** How much wallet to spend, in PAISE. Capped server-side. */
  walletAmountPaise?: number;
  startDate?: string;
  slot?: string;
  address?: CheckoutAddressInput;
}

export interface RazorpayHandoff {
  orderId: string;
  amount: number;      // paise, from Razorpay
  currency: string;
  keyId?: string;
}

export interface CheckoutResult {
  orderId: string;
  number: string;
  totalPaise: number;
  depositPaise: number;
  subscriptionId: string | null;
  type: string;
  couponDiscountPaise: number;
  walletAppliedPaise: number;
  /** What's left for the gateway after wallet/coupon. Zero when wallet covered it. */
  payablePaise: number;
  paid: boolean;
  method?: string;
  /** Present only when a gateway payment is required. */
  rzp?: RazorpayHandoff;
  /** Present when an AutoPay mandate was created instead of a one-off order. */
  autopay?: { subscriptionId: string; keyId?: string };
}

/** Places a real order. On success either `paid` is true (wallet/COD) or
 *  `rzp` carries what the native Razorpay SDK needs. */
export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  return api.post<CheckoutResult>("/api/checkout", input, { timeoutMs: 45_000 });
}

/** Abandon an order the customer backed out of, releasing the coupon and
 *  wallet holds. Call when the Razorpay sheet is dismissed — otherwise the
 *  hold lingers until it expires. */
export async function cancelCheckout(orderId: string): Promise<void> {
  await api.post("/api/checkout/cancel", { orderId });
}

/** Confirm a gateway payment. The three fields come straight from the
 *  native SDK's success callback; the server re-verifies the signature. */
export async function verifyPayment(p: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ ok: true; orderId?: string }> {
  return api.post<{ ok: true; orderId?: string }>("/api/payments/verify", p, { timeoutMs: 45_000 });
}

/* ---------------------------------------------------------------- coupons */

export interface CouponPreview {
  valid: boolean;
  code?: string;
  discountPaise?: number;
  message?: string;
}

export async function validateCoupon(code: string, variantId?: string, planId?: string): Promise<CouponPreview> {
  return api.post<CouponPreview>("/api/coupons/validate", { code, variantId, planId });
}

/* ----------------------------------------------------------------- orders */

export interface OrderItemLine {
  label: string;
  qty: number;
  pricePaise?: number;
}

export interface OrderSummary {
  id: string;
  number: string;
  status: string;
  /** GROSS total. Revenue = totalPaise − couponDiscountPaise. */
  totalPaise: number;
  couponDiscountPaise?: number;
  depositPaise?: number;
  createdAt: string;
  type?: string;
  items?: OrderItemLine[];
}

export interface OrderDetail extends OrderSummary {
  events?: { type: string; title: string; note: string | null; createdAt: string }[];
  delivery?: { date: string; status: string; slot: string | null } | null;
  payment?: { method: string; status: string } | null;
  invoiceId?: string | null;
}

export async function listOrders(): Promise<OrderSummary[]> {
  const r = await api.get<{ orders: OrderSummary[] } | OrderSummary[]>("/api/orders");
  return Array.isArray(r) ? r : r.orders;
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const r = await api.get<{ order: OrderDetail } | OrderDetail>(`/api/orders/${encodeURIComponent(id)}`);
  return "order" in (r as object) ? (r as { order: OrderDetail }).order : (r as OrderDetail);
}

/** Live banner state. Returns {active:false} rather than 401 when signed
 *  out, so it is safe to poll unconditionally. */
export async function orderStatus(): Promise<{ active: boolean; stage?: string; orderId?: string; eta?: string }> {
  return api.get("/api/order-status");
}

/* ---------------------------------------------------------- subscriptions */

export interface Subscription {
  id: string;
  planName: string;
  status: string;
  nextDeliveryAt: string | null;
  startDate?: string | null;
  endDate?: string | null;
  slot?: string | null;
  address?: { id: string; line1: string; city: string; pincode: string } | null;
  items: { qty: number; label: string; product: string }[];
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const r = await api.get<{ subscriptions: Subscription[] } | Subscription[]>("/api/account/subscription");
  return Array.isArray(r) ? r : r.subscriptions;
}

export type SubscriptionAction = "pause" | "resume" | "cancel" | "skip";

/** Lifecycle changes. `skip` takes the date to skip; `pause` may take a
 *  resume date. The server owns the rules (notice periods, refunds). */
export async function subscriptionAction(
  subscriptionId: string,
  action: SubscriptionAction,
  extra: { date?: string; resumeOn?: string; reason?: string } = {},
): Promise<{ ok: true; status?: string }> {
  return api.post<{ ok: true; status?: string }>("/api/account/subscription", {
    subscriptionId, action, ...extra,
  });
}

/* --------------------------------------------------------------- delivery */

export interface DeliveryRecord {
  id: string;
  date: string;
  status: string;
  slot: string | null;
  bottleCount?: number;
  deliveredAt?: string | null;
}

export async function listDeliveries(): Promise<DeliveryRecord[]> {
  const r = await api.get<{ deliveries: DeliveryRecord[] } | DeliveryRecord[]>("/api/deliveries");
  return Array.isArray(r) ? r : r.deliveries;
}

/** Today's active delivery. Driver coordinates appear only while the stop
 *  is actually en route — a privacy decision made server-side. */
export async function getTracking(): Promise<{
  active: boolean;
  stage?: string;
  destination?: { lat: number; lng: number } | null;
  driver?: { lat: number; lng: number; name?: string } | null;
  eta?: string | null;
}> {
  return api.get("/api/account/tracking");
}

/* --------------------------------------------------------------- invoices */

export interface Invoice {
  id: string;
  number: string;
  totalPaise: number;
  createdAt: string;
  orderId?: string;
}

export async function listInvoices(): Promise<Invoice[]> {
  const r = await api.get<{ invoices: Invoice[] } | Invoice[]>("/api/invoices");
  return Array.isArray(r) ? r : r.invoices;
}

/** The PDF endpoint streams binary with Content-Disposition — there is no
 *  browser download manager here, so the app must fetch it with the auth
 *  header and hand the bytes to expo-file-system. Returns the URL; the
 *  screen does the download so it can show progress. */
export function invoicePdfUrl(id: string): string {
  return `/api/invoices/${encodeURIComponent(id)}/pdf?dl=1`;
}
