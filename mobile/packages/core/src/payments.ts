/* =============================================================
   DOODLY mobile — Razorpay handoff.

   The website injects checkout.js and calls `new window.Razorpay().open()`.
   That is browser-only DOM code and cannot run in React Native, so this is
   the ONE part of the payment flow the app reimplements. Everything that
   matters — pricing, order creation, signature verification, the webhook —
   stays on the server and is shared with the web unchanged.

   ⚠️ react-native-razorpay is a NATIVE module: it does not exist in Expo
   Go. It is therefore loaded lazily, so the rest of the app (browsing,
   subscriptions, wallet, tracking) still runs in Expo Go and only the
   payment step needs a development or EAS build. Importing it at module
   scope would crash the whole app on launch in Expo Go.
   ============================================================= */
import type { RazorpayHandoff } from "./checkout";

export interface PaymentSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export class PaymentCancelled extends Error {
  constructor() { super("Payment was cancelled."); this.name = "PaymentCancelled"; }
}

export class PaymentUnavailable extends Error {
  constructor() {
    super("Payments need the full DOODLY app. This build can't open the payment screen.");
    this.name = "PaymentUnavailable";
  }
}

export interface PayerDetails {
  name?: string | null;
  email?: string | null;
  /** Digits, no +. Prefills the UPI/OTP step. */
  phone?: string | null;
}

/** Razorpay's checkout module, resolved at call time. Returns null when the
 *  native module isn't present (Expo Go), so the caller can explain why
 *  rather than crashing. */
function loadRazorpay(): { open: (opts: Record<string, unknown>) => Promise<PaymentSuccess> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-razorpay");
    const checkout = mod?.default ?? mod;
    return checkout && typeof checkout.open === "function" ? checkout : null;
  } catch {
    return null;
  }
}

export function paymentsAvailable(): boolean {
  return loadRazorpay() !== null;
}

/**
 * Open the Razorpay sheet for a handoff returned by placeOrder().
 * Resolves with the three signed fields to post to /api/payments/verify;
 * throws PaymentCancelled when the customer dismisses the sheet.
 *
 * The AMOUNT comes from the server's handoff and is never computed here —
 * a client-set amount would be a trivial way to underpay.
 */
export async function payWithRazorpay(
  handoff: RazorpayHandoff,
  payer: PayerDetails = {},
): Promise<PaymentSuccess> {
  const checkout = loadRazorpay();
  if (!checkout) throw new PaymentUnavailable();

  if (!handoff.keyId) {
    // Without a key id Razorpay silently shows an empty sheet; fail loudly.
    throw new Error("Payments aren't configured. Please contact DOODLY support.");
  }

  try {
    return await checkout.open({
      key: handoff.keyId,
      order_id: handoff.orderId,
      amount: handoff.amount,
      currency: handoff.currency || "INR",
      name: "DOODLY",
      description: "Farm-fresh A2 milk",
      theme: { color: "#0F3D2E" },
      prefill: {
        name: payer.name ?? "",
        email: payer.email ?? "",
        contact: payer.phone ?? "",
      },
    });
  } catch (e) {
    // Razorpay reports a user dismissal as an error with code 0 / 2 depending
    // on platform. Treat it as a cancellation, not a failure to report.
    const err = e as { code?: number; description?: string; error?: { description?: string } };
    const description = err?.description ?? err?.error?.description ?? "";
    if (err?.code === 0 || err?.code === 2 || /cancel/i.test(description)) {
      throw new PaymentCancelled();
    }
    throw new Error(description || "The payment could not be completed. You have not been charged.");
  }
}
