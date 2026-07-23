/* DOODLY Customer — subscriptions list. Tapping one opens the manage
   screen; the lifecycle rules (notice periods, refunds) all live server-side. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Badge, Button, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { listSubscriptions, type Subscription } from "@doodly/core";

export default function SubscriptionsScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setSubs(await listSubscriptions()); }
    catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Subscriptions" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <View style={{ gap: space.md }}>
          {subs.map((s) => (
            <Pressable key={s.id} onPress={() => router.push(`/subscription/${s.id}`)}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
                  <View style={{ flex: 1, gap: space.xs }}>
                    <Text variant="h3">{s.planName}</Text>
                    {s.items.length ? (
                      <Text variant="small" tone="muted">
                        {s.items.map((i) => `${i.qty} × ${i.label} ${i.product}`).join(", ")}
                      </Text>
                    ) : null}
                    {s.nextDeliveryAt ? (
                      <Text variant="caption" tone="subtle">
                        Next: {new Date(s.nextDeliveryAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: space.sm }}>
                    <Badge label={statusLabel(s.status)} intent={statusIntent(s.status)} />
                    <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>

        {!loading && !subs.length ? (
          <Card>
            <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
              <Ionicons name="repeat-outline" size={26} color={colors.ink3} />
              <Text variant="h3" center>No subscriptions</Text>
              <Text variant="small" tone="muted" center>Start one to get milk delivered every morning.</Text>
              <Button label="Browse products" onPress={() => router.push("/shop")} style={{ marginTop: space.sm }} />
            </View>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}
