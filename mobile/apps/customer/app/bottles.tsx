/* DOODLY Customer — bottle returns.
   Bottles are a real financial obligation: the deposit is refunded to
   the wallet on return, so the count shown here maps to money. Deposits
   live on Order.depositPaise, and the returns themselves are recorded
   by the delivery executive at the door — not self-service. */
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, useTheme } from "@doodly/ui";
import { getAccountSummary, listDeliveries, type AccountSummary, type DeliveryRecord } from "@doodly/core";

export default function BottlesScreen() {
  const { colors, space } = useTheme();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, d] = await Promise.allSettled([getAccountSummary(), listDeliveries()]);
    if (s.status === "fulfilled") setSummary(s.value);
    if (d.status === "fulfilled") setDeliveries(d.value.filter((x) => x.bottleCount));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pending = summary?.bottlesPending ?? 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Bottle returns" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <Card style={{
          marginBottom: space.lg,
          backgroundColor: pending > 0 ? colors.goldSoft : colors.mintSoft,
          borderColor: pending > 0 ? colors.gold : colors.leaf,
        }}>
          <Text variant="label" tone="muted">With you right now</Text>
          <Text variant="hero" style={{ marginTop: space.xs }}>{pending}</Text>
          <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>
            {pending > 0
              ? "Hand these to your delivery executive on the next delivery — your deposit is credited back to your wallet."
              : "All returned. Nothing outstanding."}
          </Text>
        </Card>

        <Card style={{ marginBottom: space.lg }}>
          <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>How it works</Text>
          <Step n={1} text="We deliver in reusable glass bottles and hold a refundable deposit." />
          <Step n={2} text="Leave your empties out on your next delivery day." />
          <Step n={3} text="Your executive records the return at the door." />
          <Step n={4} text="The deposit is credited to your DOODLY wallet." last />
        </Card>

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Recent deliveries</Text>
        {deliveries.length ? (
          <View style={{ gap: space.sm }}>
            {deliveries.slice(0, 15).map((d) => (
              <Card key={d.id} elevated={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text variant="small">
                    {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                  <Text variant="small" tone="muted">
                    {d.bottleCount} bottle{d.bottleCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ) : !loading ? (
          <Card><Text variant="small" tone="muted" center>No deliveries yet.</Text></Card>
        ) : null}
      </Screen>
    </>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View style={{
      flexDirection: "row", gap: space.md, alignItems: "flex-start", paddingVertical: space.sm,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line,
    }}>
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: colors.mintSoft,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text variant="caption" tone="brand">{n}</Text>
      </View>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}
