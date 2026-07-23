/* =============================================================
   DOODLY Delivery — today's route.
   A FlatList (not a ScrollView) so a 60-stop day stays smooth on the
   low-end Android hardware delivery staff typically carry.

   Ordering follows the server's `seq`. Completed stops stay visible but
   recede — an executive needs to confirm what they've already done
   without losing their place in the remaining run.
   ============================================================= */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, View, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Screen, Card, Text, Badge, Button, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { getRoute, ApiError, type MyRoute, type RouteStop } from "@doodly/core";

export default function RouteScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();

  const [data, setData] = useState<MyRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await getRoute()); }
    catch (e) {
      if (e instanceof ApiError && e.code === "offline") setError("You're offline. Showing the last route we loaded.");
      else setError(e instanceof Error ? e.message : "Could not load your route.");
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { remaining, done } = useMemo(() => {
    const stops = data?.stops ?? [];
    return {
      remaining: stops.filter((s) => s.status !== "delivered"),
      done: stops.filter((s) => s.status === "delivered"),
    };
  }, [data]);

  // Remaining first (in route order), completed collapsed at the bottom.
  const ordered = useMemo(() => [...remaining, ...done], [remaining, done]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Today's route" }} />
      <Screen bleed>
        <FlatList
          data={ordered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.base, paddingBottom: space.xxl, gap: space.md }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.leaf} colors={[colors.leaf]} />}
          ListHeaderComponent={
            <View style={{ gap: space.sm, marginBottom: space.xs }}>
              {data?.isFallbackDate ? (
                <Card elevated={false} style={{ backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
                  <Text variant="small" tone="muted">
                    No deliveries today — showing your most recent route ({data.date}).
                  </Text>
                </Card>
              ) : null}
              {error ? (
                <Card elevated={false} style={{ backgroundColor: "rgba(214,69,61,0.08)", borderColor: "rgba(214,69,61,0.3)" }}>
                  <Text variant="small" tone="danger">{error}</Text>
                </Card>
              ) : null}
              {data ? (
                <Text variant="small" tone="muted">
                  {remaining.length} remaining · {done.length} delivered
                  {data.route ? ` · ${data.route.name}` : ""}
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <StopCard stop={item} onPress={() => router.push(`/stop/${item.id}`)} />}
          ListEmptyComponent={
            loading ? null : (
              <Card>
                <View style={{ gap: space.sm, alignItems: "center", paddingVertical: space.lg }}>
                  <Text variant="h3" center>No deliveries assigned</Text>
                  <Text variant="small" tone="muted" center>
                    Start your shift on the dashboard to be assigned today&apos;s stops.
                  </Text>
                </View>
              </Card>
            )
          }
        />
      </Screen>
    </>
  );
}

function StopCard({ stop, onPress }: { stop: RouteStop; onPress: () => void }) {
  const { colors, space } = useTheme();
  const isDone = stop.status === "delivered";

  const navigate = () => {
    // Prefer exact coordinates; fall back to the text address so navigation
    // still works for an address that was never geocoded.
    const q = stop.lat != null && stop.lng != null
      ? `${stop.lat},${stop.lng}`
      : encodeURIComponent([stop.address, stop.pincode].filter(Boolean).join(" "));
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
  };

  const call = () => {
    if (!stop.mobile) return;
    Linking.openURL(`tel:${stop.mobile}`).catch(() => {});
  };

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Stop ${stop.seq}, ${stop.name}`}>
      <Card style={isDone ? { opacity: 0.6 } : undefined}>
        <View style={{ flexDirection: "row", gap: space.md }}>
          {/* sequence chip — the executive's place in the run */}
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: isDone ? colors.mintSoft : colors.forest,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text variant="caption" style={{ color: isDone ? colors.leaf600 : "#FFFFFF" }}>{stop.seq}</Text>
          </View>

          <View style={{ flex: 1, gap: space.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
              <Text variant="h3" style={{ flex: 1 }} numberOfLines={1}>{stop.name}</Text>
              <Badge label={statusLabel(stop.status)} intent={statusIntent(stop.status)} />
            </View>

            <Text variant="small" tone="muted" numberOfLines={2}>{stop.address}</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 2 }}>
              {stop.itemLabel ? <Text variant="caption" tone="subtle">{stop.qty} × {stop.itemLabel}</Text> : null}
              <Text variant="caption" tone="subtle">· {stop.bottlesExpected} bottle{stop.bottlesExpected === 1 ? "" : "s"}</Text>
              {stop.payment.startsWith("COD") ? <Text variant="caption" tone="warning">· {stop.payment}</Text> : null}
            </View>

            {stop.instructions ? (
              <Text variant="caption" tone="subtle" numberOfLines={2} style={{ fontStyle: "italic" }}>
                “{stop.instructions}”
              </Text>
            ) : null}

            {!isDone ? (
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
                <Button label="Navigate" variant="secondary" size="sm" onPress={navigate} />
                {stop.mobile ? <Button label="Call" variant="ghost" size="sm" onPress={call} /> : null}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
