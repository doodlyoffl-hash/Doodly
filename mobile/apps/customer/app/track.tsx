/* =============================================================
   DOODLY Customer — live delivery tracking.
   Stage-based rather than map-based, matching what the backend actually
   exposes: driver coordinates are only released while a stop is EN
   ROUTE, which is a deliberate privacy decision. When they are present
   we show distance, not a live map — a map that only appears for ten
   minutes a day isn't worth the bundle size yet.
   ============================================================= */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, AppState } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { getTracking } from "@doodly/core";

const STAGES = [
  { key: "CONFIRMED", label: "Order confirmed", icon: "checkmark-circle-outline" },
  { key: "PACKED", label: "Packed and ready", icon: "cube-outline" },
  { key: "ASSIGNED", label: "Assigned to an executive", icon: "person-outline" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery", icon: "bicycle-outline" },
  { key: "DELIVERED", label: "Delivered", icon: "home-outline" },
] as const;

export default function TrackScreen() {
  const { colors, space } = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTracking>> | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { setData(await getTracking()); }
    catch { /* keep the last good state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    // Poll while the screen is open and the app is foregrounded. Polling in
    // the background would drain the battery for a screen nobody is looking at.
    const start = () => { if (!timer.current) timer.current = setInterval(load, 30_000); };
    const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    start();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? (void load(), start()) : stop()));
    return () => { stop(); sub.remove(); };
  }, [load]);

  const stage = String(data?.stage ?? "").toUpperCase();
  const reached = STAGES.findIndex((s) => s.key === stage);
  const distanceKm = haversineKm(data?.driver, data?.destination);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Track delivery" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        {data?.active ? (
          <>
            <Card style={{ marginBottom: space.md, backgroundColor: colors.forest, borderColor: colors.forest }}>
              <Text variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>Right now</Text>
              <Text variant="h2" tone="onBrand" style={{ marginTop: space.xs }}>
                {statusLabel(stage || "On the way")}
              </Text>
              {data.eta ? (
                <Text variant="small" style={{ color: "rgba(255,255,255,0.75)", marginTop: space.xs }}>
                  Expected around {data.eta}
                </Text>
              ) : null}
              {distanceKm !== null ? (
                <Text variant="small" style={{ color: colors.mint, marginTop: space.sm }}>
                  About {distanceKm < 1 ? "less than a kilometre" : `${distanceKm.toFixed(1)} km`} away
                </Text>
              ) : null}
            </Card>

            <Card>
              {STAGES.map((s, i) => {
                const done = reached >= 0 && i <= reached;
                const current = i === reached;
                return (
                  <View key={s.key} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                    <View style={{ alignItems: "center" }}>
                      <Ionicons
                        name={done ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={done ? colors.leaf : colors.ink3}
                      />
                      {i < STAGES.length - 1 ? (
                        <View style={{ width: 2, height: 26, backgroundColor: i < reached ? colors.leaf : colors.line }} />
                      ) : null}
                    </View>
                    <View style={{ flex: 1, paddingTop: 1 }}>
                      <Text variant={current ? "bodyMed" : "small"} tone={done ? "default" : "subtle"}>
                        {s.label}
                      </Text>
                      {current ? <Badge label="Now" intent="brand" style={{ marginTop: space.xs }} /> : null}
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : (
          <Card>
            <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
              <Ionicons name="bicycle-outline" size={28} color={colors.ink3} />
              <Text variant="h3" center>Nothing on the way</Text>
              <Text variant="small" tone="muted" center>
                When a delivery is out for delivery you&apos;ll be able to follow it here.
              </Text>
            </View>
          </Card>
        )}
      </Screen>
    </>
  );
}

/** Straight-line distance. Deliberately approximate — it answers "are they
 *  close?", which is the only question being asked, without a routing API. */
function haversineKm(
  a?: { lat: number; lng: number } | null,
  b?: { lat: number; lng: number } | null,
): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
