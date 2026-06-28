"use client";
/* =============================================================
   DOODLY — Razorpay Checkout (client)
   Opens the Razorpay modal for a one-time order OR a recurring
   auto-pay mandate. The order/subscription is created on the server
   (/api/payments/order or /api/subscriptions/autopay) — the browser
   only ever sees the public key id, never the secret.
   ============================================================= */
import { useCallback, useState } from "react";

declare global {
  interface Window { Razorpay?: any; }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(s);
  });
}

type Props = {
  /** Product selection — the price is computed SERVER-SIDE from this, never sent by the client. */
  selection: { variantId: string; planId?: string; bottles?: number };
  receipt: string;
  customer?: { name?: string; email?: string; contact?: string };
  /** when set, opens a recurring auto-pay mandate instead of a one-time order */
  autopay?: { planSlug: string; totalCount: number; subscriptionId: string };
  onSuccess?: (paymentId: string) => void;
  onFailure?: (message: string) => void;
  children?: React.ReactNode;
  className?: string;
};

export function RazorpayCheckout({ selection, receipt, customer, autopay, onSuccess, onFailure, children, className }: Props) {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      await loadCheckout();
      const base: any = {
        name: "DOODLY",
        description: autopay ? "Auto-pay subscription" : "Fresh milk order",
        image: "/logo.png",
        theme: { color: "#1FAE66" },
        prefill: { name: customer?.name, email: customer?.email, contact: customer?.contact },
        modal: { ondismiss: () => onFailure?.("Payment cancelled") },
        handler: async (res: any) => {
          // one-time: verify the signature server-side before showing success
          if (!autopay) {
            const v = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) }).then((r) => r.json()).catch(() => ({ verified: false }));
            if (!v.verified) { onFailure?.("We couldn't verify your payment."); return; }
          }
          onSuccess?.(res.razorpay_payment_id);
        },
      };

      if (autopay) {
        const r = await fetch("/api/subscriptions/autopay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autopay) }).then((x) => x.json());
        if (r.error) { onFailure?.(r.error); return; }
        new window.Razorpay({ ...base, key: r.keyId, subscription_id: r.subscriptionId, recurring: 1 }).open();
      } else {
        const r = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selection, receipt }) }).then((x) => x.json());
        if (r.error) { onFailure?.(r.error); return; }
        new window.Razorpay({ ...base, key: r.keyId, order_id: r.orderId, amount: r.amount, currency: r.currency }).open();
      }
    } catch (e: any) {
      onFailure?.(e?.message ?? "Payment could not start.");
    } finally {
      setBusy(false);
    }
  }, [selection, receipt, customer, autopay, onSuccess, onFailure]);

  return (
    <button type="button" className={className} onClick={pay} disabled={busy} aria-busy={busy}>
      {busy ? "Starting secure payment…" : children ?? "Pay securely"}
    </button>
  );
}
