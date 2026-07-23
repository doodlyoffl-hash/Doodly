/* =============================================================
   DOODLY Customer — orders.
   Revenue shown per order is totalPaise − couponDiscountPaise: Order
   .totalPaise is GROSS and the coupon is stored separately, so printing
   totalPaise alone overstates what the customer actually paid.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, RefreshControl, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, useTheme, Badge, statusIntent, statusLabel } from "@doodly/ui";
import { listOrders, ApiError, type OrderSummary } from "@doodly/core";

export default function OrdersScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setOrders(await listOrders()); }
    catch (e) {
      setError(e instanceof ApiError && e.code === "offline"
        ? "You're offline."
        : "Couldn't load your orders.");
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen bleed>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: space.base, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.leaf} colors={[colors.leaf]} />}
        ListHeaderComponent={
          <View style={{ marginBottom: space.xs }}>
            <Text variant="h1">Orders</Text>
            {error ? <Text variant="small" tone="danger" style={{ marginTop: space.xs }}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/order/${item.id}`)}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
                <View style={{ flex: 1, gap: space.xs }}>
                  <Text variant="h3">#{item.number}</Text>
                  <Text variant="caption" tone="subtle">
                    {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                  {item.items?.length ? (
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {item.items.map((l) => `${l.qty} × ${l.label}`).join(", ")}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: space.xs }}>
                  <Badge label={statusLabel(item.status)} intent={statusIntent(item.status)} />
                  {/* net of coupon — totalPaise is gross */}
                  <Money paise={item.totalPaise - (item.couponDiscountPaise ?? 0)} variant="bodyMed" />
                </View>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Card>
              <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
                <Ionicons name="receipt-outline" size={28} color={colors.ink3} />
                <Text variant="h3" center>No orders yet</Text>
                <Text variant="small" tone="muted" center>
                  Your first DOODLY delivery is a tap away.
                </Text>
              </View>
            </Card>
          )
        }
      />
    </Screen>
  );
}
