/* =============================================================
   DOODLY Customer — checkout.

   The order of operations matters and is deliberate:
     1. placeOrder() — the SERVER prices everything and creates the order
     2. if fully covered by wallet/COD → done
     3. otherwise open Razorpay with the server's handoff
     4. verifyPayment() — the server re-checks the signature

   If the customer dismisses the payment sheet we call cancelCheckout(),
   which releases the coupon and wallet holds. Without that, a customer who
   backs out has their coupon consumed and their wallet balance locked until
   the hold expires — a support ticket every time.
   ============================================================= */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable, TextInput, Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Button, Badge, useTheme } from "@doodly/ui";
import {
  getCatalogue, listAddresses, getWallet, getProfile,
  placeOrder, cancelCheckout, verifyPayment, validateCoupon,
  payWithRazorpay, paymentsAvailable, PaymentCancelled, PaymentUnavailable,
  variantPricePaise, isTrial, ApiError, track, Events,
  type Catalogue, type Address, type CheckoutInput,
} from "@doodly/core";

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ variantId: string; planId?: string; bottles?: string }>();
  const { colors, space, radius } = useTheme();
  const router = useRouter();

  const [cat, setCat] = useState<Catalogue | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [walletPaise, setWalletPaise] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [payer, setPayer] = useState<{ name?: string | null; email?: string | null; phone?: string | null }>({});
  const [cod, setCod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottles = Math.max(1, Number(params.bottles ?? 1) || 1);

  const load = useCallback(async () => {
    try {
      const [c, addrs, w, p] = await Promise.allSettled([
        getCatalogue(), listAddresses(), getWallet(), getProfile(),
      ]);
      if (c.status === "fulfilled") setCat(c.value);
      if (addrs.status === "fulfilled") {
        setAddresses(addrs.value);
        const def = addrs.value.find((a) => a.isDefault) ?? addrs.value[0];
        if (def) setAddressId(def.id);
      }
      if (w.status === "fulfilled") setWalletPaise(w.value.balancePaise ?? 0);
      if (p.status === "fulfilled") setPayer({ name: p.value.name, email: p.value.email, phone: p.value.phone });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const variant = cat?.variants.find((v) => v.id === params.variantId) ?? null;
  const plan = cat?.plans.find((p) => p.id === params.planId) ?? null;
  const trial = variant ? isTrial(variant) : false;

  // Display-only estimate; the server is the authority (see placeOrder).
  const estimate = useMemo(() => {
    if (!variant) return { itemsPaise: 0, depositPaise: 0, totalPaise: 0 };
    const itemsPaise = trial
      ? variantPricePaise(variant)
      : Math.round(variantPricePaise(variant) * bottles * (plan?.days ?? 1) * (1 - (plan?.discount ?? 0)));
    const depositPaise = cat?.bottleDepositPaise ?? 0;
    return { itemsPaise, depositPaise, totalPaise: itemsPaise + depositPaise };
  }, [variant, plan, bottles, trial, cat]);

  const walletApplied = useWallet ? Math.min(walletPaise, estimate.totalPaise) : 0;
  const payable = Math.max(0, estimate.totalPaise - walletApplied);

  async function applyCoupon() {
    if (!coupon.trim()) return;
    try {
      const r = await validateCoupon(coupon.trim(), params.variantId, params.planId);
      setCouponMsg(r.valid
        ? { ok: true, text: r.discountPaise ? `Coupon applied — ₹${Math.round(r.discountPaise / 100)} off` : "Coupon applied" }
        : { ok: false, text: r.message ?? "That coupon isn't valid." });
    } catch (e) {
      setCouponMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't check that coupon." });
    }
  }

  async function submit() {
    if (!addressId) { setError("Choose a delivery address first."); return; }
    setBusy(true); setError(null);

    const input: CheckoutInput = {
      variantId: params.variantId,
      ...(trial ? {} : { planId: params.planId || undefined, bottles }),
      address: { id: addressId },
      ...(coupon.trim() && couponMsg?.ok ? { couponCode: coupon.trim() } : {}),
      ...(walletApplied > 0 ? { walletAmountPaise: walletApplied } : {}),
      ...(cod ? { method: undefined } : { method: "upi" }),
    };

    let orderId: string | null = null;
    try {
      track(Events.startedCheckout, { trial, wallet: walletApplied > 0, coupon: !!(coupon.trim() && couponMsg?.ok) });
      const result = await placeOrder(input);
      orderId = result.orderId;
      track(Events.orderPlaced, { orderId: result.orderId, payable: result.payablePaise });

      // Wallet or COD covered it — nothing to pay through the gateway.
      if (result.paid || !result.rzp) {
        router.replace({ pathname: "/order/[id]", params: { id: result.orderId } });
        return;
      }

      const signed = await payWithRazorpay(result.rzp, payer);
      await verifyPayment(signed);
      track(Events.paymentSucceeded, { orderId: result.orderId });
      router.replace({ pathname: "/order/[id]", params: { id: result.orderId } });
    } catch (e) {
      if (e instanceof PaymentCancelled) {
        track(Events.paymentCancelled, { orderId: orderId ?? undefined });
        // Release the coupon/wallet holds so the customer isn't penalised for
        // changing their mind.
        if (orderId) await cancelCheckout(orderId).catch(() => {});
        setError("Payment cancelled. You have not been charged.");
      } else if (e instanceof PaymentUnavailable) {
        if (orderId) await cancelCheckout(orderId).catch(() => {});
        setError(e.message);
      } else if (e instanceof ApiError && e.code === "offline") {
        setError("No internet connection. Your order was not placed.");
      } else {
        if (orderId) await cancelCheckout(orderId).catch(() => {});
        setError(e instanceof Error ? e.message : "Could not complete your order.");
      }
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Checkout" }} />
        <Screen><Text tone="muted">Loading…</Text></Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Checkout" }} />
      <Screen
        scroll
        footer={
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="body" tone="muted">To pay now</Text>
              <Money paise={payable} variant="h3" />
            </View>
            <Button
              label={payable === 0 ? "Place order" : "Pay securely"}
              onPress={submit}
              loading={busy}
              disabled={!addressId || busy}
              fullWidth
            />
          </View>
        }
      >
        {/* address */}
        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Deliver to</Text>
        {addresses.length ? (
          <View style={{ gap: space.sm, marginBottom: space.lg }}>
            {addresses.map((a) => (
              <Pressable key={a.id} onPress={() => setAddressId(a.id)}>
                <Card style={a.id === addressId ? { borderColor: colors.leaf, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                    <Ionicons
                      name={a.id === addressId ? "radio-button-on" : "radio-button-off"}
                      size={20} color={a.id === addressId ? colors.leaf : colors.ink3}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMed">{a.label ?? "Address"}</Text>
                      <Text variant="small" tone="muted">
                        {[a.line1, a.area, a.city, a.pincode].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
            <Button label="Add a new address" variant="ghost" size="sm" onPress={() => router.push("/addresses")} />
          </View>
        ) : (
          <Card style={{ marginBottom: space.lg }}>
            <Text variant="small" tone="muted">You haven&apos;t added a delivery address yet.</Text>
            <Button label="Add address" onPress={() => router.push("/addresses")} style={{ marginTop: space.base }} />
          </Card>
        )}

        {/* coupon */}
        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Coupon</Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.xs }}>
          <TextInput
            value={coupon}
            onChangeText={(t) => { setCoupon(t.toUpperCase()); setCouponMsg(null); }}
            placeholder="Enter code"
            placeholderTextColor={colors.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            style={{
              flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
              borderRadius: radius.sm, paddingHorizontal: space.base, paddingVertical: 12,
              color: colors.ink, fontFamily: "HankenGrotesk_400Regular", fontSize: 15,
            }}
          />
          <Button label="Apply" variant="secondary" size="sm" onPress={applyCoupon} disabled={!coupon.trim()} />
        </View>
        {couponMsg ? (
          <Text variant="caption" tone={couponMsg.ok ? "success" : "danger"} style={{ marginBottom: space.lg }}>
            {couponMsg.text}
          </Text>
        ) : <View style={{ marginBottom: space.lg }} />}

        {/* wallet */}
        {walletPaise > 0 ? (
          <Pressable onPress={() => setUseWallet((v) => !v)} style={{ marginBottom: space.lg }}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Ionicons name={useWallet ? "checkbox" : "square-outline"} size={22} color={useWallet ? colors.leaf : colors.ink3} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMed">Use wallet balance</Text>
                  <Text variant="caption" tone="subtle">
                    Available <Money paise={walletPaise} variant="caption" tone="subtle" />
                  </Text>
                </View>
                {useWallet ? <Money paise={-walletApplied} variant="bodyMed" tone="success" /> : null}
              </View>
            </Card>
          </Pressable>
        ) : null}

        {/* summary */}
        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Summary</Text>
        <Card style={{ marginBottom: space.md }}>
          <Line label={variant?.label ?? "Item"} paise={estimate.itemsPaise} />
          {!trial && plan ? <Line label={`${plan.name} · ${bottles} bottle${bottles === 1 ? "" : "s"}/day`} /> : null}
          {estimate.depositPaise > 0 ? <Line label="Bottle deposit (refundable)" paise={estimate.depositPaise} /> : null}
          {walletApplied > 0 ? <Line label="Wallet" paise={-walletApplied} tone="success" /> : null}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.sm }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="bodyMed">To pay</Text>
            <Money paise={payable} variant="bodyMed" />
          </View>
        </Card>

        {!paymentsAvailable() ? (
          <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
            <Text variant="caption" tone="muted">
              Card and UPI payments need the full DOODLY app from the store. Wallet-covered
              orders work here.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Card elevated={false} style={{ backgroundColor: "rgba(214,69,61,0.08)", borderColor: "rgba(214,69,61,0.3)" }}>
            <Text variant="small" tone="danger">{error}</Text>
          </Card>
        ) : null}

        <Text variant="caption" tone="subtle" style={{ marginTop: space.md }}>
          Final pricing is calculated and confirmed by DOODLY when the order is placed.
        </Text>
      </Screen>
    </>
  );
}

function Line({ label, paise, tone }: { label: string; paise?: number; tone?: "success" }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space.xs, gap: space.md }}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>{label}</Text>
      {paise !== undefined ? <Money paise={paise} variant="small" tone={tone ?? "default"} /> : null}
    </View>
  );
}
