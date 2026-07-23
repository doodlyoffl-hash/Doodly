/* =============================================================
   DOODLY Customer — order detail.
   Also the post-purchase landing screen, so the top of it has to answer
   "did my payment work?" before anything else.

   Money shown is NET of the coupon: Order.totalPaise is GROSS and the
   discount is stored separately, so printing totalPaise alone would
   overstate what the customer paid.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, Share } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { getOrder, ApiError, type OrderDetail } from "@doodly/core";

/** The fulfilment journey, in the order it happens. Anything the server
 *  reports that isn't in this list still renders via the events list. */
const STAGES = [
  { key: "CONFIRMED", label: "Order confirmed" },
  { key: "PACKED", label: "Packed" },
  { key: "ASSIGNED", label: "Assigned to an executive" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space } = useTheme();
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setOrder(await getOrder(id)); }
    catch (e) {
      setError(e instanceof ApiError && e.code === "offline"
        ? "You're offline. We'll show this when you reconnect."
        : "Couldn't load this order.");
    }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const paid = order ? ["PAID", "CONFIRMED", "DELIVERED", "COMPLETED"].includes(String(order.status).toUpperCase()) : false;
  const netPaise = order ? order.totalPaise - (order.couponDiscountPaise ?? 0) : 0;
  const reachedIndex = order ? STAGES.findIndex((s) => s.key === String(order.status).toUpperCase()) : -1;

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Order" }} />
        <Screen><Text tone="muted">Loading…</Text></Screen>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Order" }} />
        <Screen>
          <Card>
            <Text variant="h3">Order not found</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>{error ?? "It may have been removed."}</Text>
            <Button label="Back to orders" onPress={() => router.replace("/orders")} style={{ marginTop: space.base }} />
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `#${order.number}` }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        {/* the first thing a customer wants after paying */}
        {paid ? (
          <Card style={{ marginBottom: space.md, backgroundColor: colors.mintSoft, borderColor: colors.leaf }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Ionicons name="checkmark-circle" size={26} color={colors.leaf600} />
              <View style={{ flex: 1 }}>
                <Text variant="h3" tone="brand">Order confirmed</Text>
                <Text variant="small" tone="muted">We&apos;ll deliver fresh to your door.</Text>
              </View>
            </View>
          </Card>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: space.lg }}>
          <View style={{ gap: 2 }}>
            <Text variant="h1">#{order.number}</Text>
            <Text variant="caption" tone="subtle">
              {new Date(order.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          <Badge label={statusLabel(order.status)} intent={statusIntent(order.status)} />
        </View>

        {/* progress */}
        {reachedIndex >= 0 ? (
          <Card style={{ marginBottom: space.md }}>
            <Text variant="label" tone="muted" style={{ marginBottom: space.md }}>Progress</Text>
            {STAGES.map((s, i) => {
              const done = i <= reachedIndex;
              return (
                <View key={s.key} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                  <View style={{ alignItems: "center" }}>
                    <Ionicons
                      name={done ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={done ? colors.leaf : colors.ink3}
                    />
                    {i < STAGES.length - 1 ? (
                      <View style={{ width: 2, height: 22, backgroundColor: i < reachedIndex ? colors.leaf : colors.line }} />
                    ) : null}
                  </View>
                  <Text variant="small" tone={done ? "default" : "subtle"} style={{ paddingTop: 1 }}>{s.label}</Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* items */}
        {order.items?.length ? (
          <Card style={{ marginBottom: space.md }}>
            <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Items</Text>
            {order.items.map((l, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.xs, gap: space.md }}>
                <Text variant="small" style={{ flex: 1 }}>{l.qty} × {l.label}</Text>
                {l.pricePaise !== undefined ? <Money paise={l.pricePaise} variant="small" /> : null}
              </View>
            ))}
          </Card>
        ) : null}

        {/* money */}
        <Card style={{ marginBottom: space.md }}>
          <Row label="Order total" paise={order.totalPaise} />
          {order.couponDiscountPaise ? <Row label="Coupon discount" paise={-order.couponDiscountPaise} tone="success" /> : null}
          {order.depositPaise ? <Row label="Bottle deposit (refundable)" paise={order.depositPaise} /> : null}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.sm }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="bodyMed">Paid</Text>
            <Money paise={netPaise} variant="bodyMed" />
          </View>
          {order.payment ? (
            <Text variant="caption" tone="subtle" style={{ marginTop: space.xs }}>
              {order.payment.method} · {order.payment.status}
            </Text>
          ) : null}
        </Card>

        {/* delivery */}
        {order.delivery ? (
          <Card style={{ marginBottom: space.md }}>
            <Text variant="label" tone="muted">Delivery</Text>
            <Text variant="body" style={{ marginTop: space.xs }}>
              {new Date(order.delivery.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
            </Text>
            {order.delivery.slot ? <Text variant="small" tone="muted">{order.delivery.slot}</Text> : null}
          </Card>
        ) : null}

        {order.invoiceId ? (
          <Button label="View invoice" variant="secondary" onPress={() => router.push("/invoices")} fullWidth style={{ marginBottom: space.sm }} />
        ) : null}
        <Button label="Back to orders" variant="ghost" onPress={() => router.replace("/orders")} fullWidth />
      </Screen>
    </>
  );
}

function Row({ label, paise, tone }: { label: string; paise: number; tone?: "success" }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space.xs, gap: space.md }}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>{label}</Text>
      <Money paise={paise} variant="small" tone={tone ?? "default"} />
    </View>
  );
}
