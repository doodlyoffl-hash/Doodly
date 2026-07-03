/* POST /api/wallet/recharge/order — start a real wallet top-up.
   Validates the amount against the admin recharge config SERVER-SIDE, then
   creates a Razorpay order tagged with the signed-in customer's id. The
   client gets { orderId, amount, keyId } for the Checkout popup; the credit
   itself only happens in /api/wallet/recharge/confirm after signature
   verification — the client can never mint balance. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, razorpayConfigured } from "@/lib/razorpay";
import { getRechargeConfig } from "@/lib/wallet/service";
import { currentUserId } from "@/lib/wallet/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ amountPaise: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to add money to your wallet" }, { status: 401 });
  if (!razorpayConfigured()) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount." }, { status: 422 });

  const cfg = await getRechargeConfig();
  const amt = parsed.data.amountPaise;
  if (!cfg.enabled) return NextResponse.json({ error: "Wallet recharge is currently disabled." }, { status: 409 });
  if (amt < cfg.minPaise) return NextResponse.json({ error: `Minimum recharge is ₹${cfg.minPaise / 100}.` }, { status: 422 });
  if (amt > cfg.maxPaise) return NextResponse.json({ error: `Maximum recharge is ₹${cfg.maxPaise / 100}.` }, { status: 422 });

  try {
    const receipt = `wal-${userId.slice(-8)}-${Date.now().toString(36)}`;
    const order = await createOrder(amt, { receipt, notes: { purpose: "wallet_recharge", userId } });
    return NextResponse.json({
      orderId: order.id, amount: order.amount, currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("wallet.recharge.order", (e as Error)?.message);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
