/* DOODLY Customer — Pure Rewards.
   Points are earned on orders, bottle returns and delivery streaks, and
   redeem into wallet credit. Redemption is server-side and idempotent. */
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Badge, useTheme } from "@doodly/ui";
import { getRewards, type Rewards } from "@doodly/core";

export default function RewardsScreen() {
  const { colors, space } = useTheme();
  const [data, setData] = useState<Rewards | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await getRewards()); }
    catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rewards" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <Card style={{ backgroundColor: colors.forest, borderColor: colors.forest, marginBottom: space.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>Your points</Text>
              <Text variant="hero" tone="onBrand">{data?.points ?? 0}</Text>
            </View>
            {data?.tier ? <Badge label={data.tier} intent="pending" /> : null}
          </View>
          {data?.redeemableValuePaise ? (
            <Text variant="small" style={{ color: "rgba(255,255,255,0.75)", marginTop: space.sm }}>
              Worth <Money paise={data.redeemableValuePaise} variant="small" tone="onBrand" /> in wallet credit.
            </Text>
          ) : null}
        </Card>

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>How you earn</Text>
        <Card style={{ marginBottom: space.lg }}>
          <EarnRow icon="cart-outline" text="Every order you place" />
          <EarnRow icon="cube-outline" text="Returning your empty bottles" />
          <EarnRow icon="flame-outline" text="Keeping a delivery streak going" />
          <EarnRow icon="people-outline" text="Referring friends" last />
        </Card>

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>History</Text>
        {data?.history?.length ? (
          <View style={{ gap: space.sm }}>
            {data.history.map((h) => (
              <Card key={h.id} elevated={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="small">{h.reason}</Text>
                    <Text variant="caption" tone="subtle">
                      {new Date(h.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Text variant="bodyMed" tone={h.points >= 0 ? "success" : "muted"}>
                    {h.points >= 0 ? "+" : ""}{h.points}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ) : !loading ? (
          <Card><Text variant="small" tone="muted" center>No points activity yet.</Text></Card>
        ) : null}
      </Screen>
    </>
  );
}

function EarnRow({ icon, text, last }: { icon: keyof typeof Ionicons.glyphMap; text: string; last?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line,
    }}>
      <Ionicons name={icon} size={18} color={colors.leaf} />
      <Text variant="small" style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}
