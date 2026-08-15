import { describe, it, expect, vi, beforeAll } from "vitest";
import crypto from "node:crypto";

/* The Razorpay webhook (payments/webhook) verifies the RAW body against
   RAZORPAY_WEBHOOK_SECRET before handling ANY event — including the new
   assisted-order `payment_link.paid` / `.cancelled` / `.expired` events.
   This pins that security gate (pure crypto, no DB) so a forged
   payment_link.paid can never settle an order. */

const SECRET = "test_webhook_secret_ao3";

beforeAll(() => { vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET); });

async function loadVerify() {
  const mod = await import("@/lib/razorpay");   // dynamic import AFTER the env stub so the secret is captured
  return mod.verifyWebhookSignature;
}

const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

describe("payment-link webhook signature gate", () => {
  it("accepts a correctly-signed payment_link.paid body", async () => {
    const verify = await loadVerify();
    const body = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_x", notes: { orderId: "o1" } } }, payment: { entity: { id: "pay_x" } } } });
    expect(verify(body, sign(body))).toBe(true);
  });

  it("rejects a tampered body (forged settlement)", async () => {
    const verify = await loadVerify();
    const body = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_x", notes: { orderId: "o1" } } } } });
    const goodSig = sign(body);
    const forged = body.replace("\"o1\"", "\"o2\"");   // attacker swaps the target order
    expect(verify(forged, goodSig)).toBe(false);
  });

  it("rejects a wrong signature", async () => {
    const verify = await loadVerify();
    const body = JSON.stringify({ event: "payment_link.cancelled", payload: { payment_link: { entity: { id: "plink_y" } } } });
    expect(verify(body, sign(body).replace(/.$/, "0"))).toBe(false);
  });
});
