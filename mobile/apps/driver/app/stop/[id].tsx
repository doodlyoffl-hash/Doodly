/* =============================================================
   DOODLY Delivery — stop detail + delivery actions.
   The screen that actually completes a delivery, so it is built around
   two rules:

   1. NEVER BLOCK ON THE NETWORK. Every action goes through the offline
      queue: the executive gets an immediate result and the server is
      told when signal allows. Replays are safe because the backend's
      completeDelivery() no-ops an already-DELIVERED stop.
   2. BOTTLES ARE MONEY. Empties collected drive the customer's deposit
      refund and loyalty points, so the count is an explicit, deliberate
      input — never silently defaulted at the moment of completion.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Card, Text, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { getRoute, updateStop, ApiError, type RouteStop, type DeliveryAction } from "@doodly/core";

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space, radius } = useTheme();
  const router = useRouter();

  const [stop, setStop] = useState<RouteStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DeliveryAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bottlesIn, setBottlesIn] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const route = await getRoute();
      const found = route.stops.find((s) => s.id === id) ?? null;
      setStop(found);
      if (found && bottlesIn === null) setBottlesIn(found.bottlesExpected);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "offline")) {
        setError(e instanceof Error ? e.message : "Could not load this stop.");
      }
    } finally { setLoading(false); }
  }, [id, bottlesIn]);

  useEffect(() => { void load(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function act(status: DeliveryAction, extra: { bottlesIn?: number; remark?: string } = {}) {
    if (!stop) return;
    setBusy(status);
    setError(null);
    setNotice(null);
    try {
      const res = await updateStop(stop.id, { status, ...extra }, `Stop ${stop.seq} — ${statusLabel(status)}`);
      if (res.synced) {
        setNotice(`Saved — ${statusLabel(status).toLowerCase()}.`);
      } else {
        // Queued: say so plainly. "Saved" alone would be a lie the
        // executive discovers only when ops calls asking about the stop.
        setNotice("Saved on your phone — it will sync when you're back online.");
      }
      if (status === "DELIVERED" || status === "FAILED" || status === "SKIPPED") {
        setTimeout(() => router.back(), 900);
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this stop.");
    } finally { setBusy(null); }
  }

  function confirmDelivered() {
    const expected = stop?.bottlesExpected ?? 0;
    const collected = bottlesIn ?? 0;
    const proceed = () => void act("DELIVERED", { bottlesIn: collected });

    // A mismatch is legitimate (customer kept a bottle) but must be
    // deliberate, because it moves the customer's deposit balance.
    if (collected !== expected) {
      Alert.alert(
        "Bottle count doesn't match",
        `Expected ${expected} empt${expected === 1 ? "y" : "ies"}, you're recording ${collected}. This affects the customer's bottle deposit.`,
        [{ text: "Change", style: "cancel" }, { text: "Confirm", onPress: proceed }],
      );
      return;
    }
    proceed();
  }

  function confirmFailed(status: "FAILED" | "SKIPPED", title: string) {
    Alert.alert(title, "This will be reported to the operations team.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: () => void act(status, { remark: title }),
      },
    ]);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Stop" }} />
        <Screen><Text tone="muted">Loading…</Text></Screen>
      </>
    );
  }

  if (!stop) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Stop" }} />
        <Screen>
          <Card>
            <Text variant="h3">Stop not found</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>
              {error ?? "It may have been reassigned. Pull to refresh your route."}
            </Text>
            <Button label="Back to route" onPress={() => router.back()} style={{ marginTop: space.base }} />
          </Card>
        </Screen>
      </>
    );
  }

  const done = stop.status === "delivered";
  const navigate = () => {
    const q = stop.lat != null && stop.lng != null
      ? `${stop.lat},${stop.lng}`
      : encodeURIComponent([stop.address, stop.pincode].filter(Boolean).join(" "));
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
  };

  // Structured last-mile detail, in the order someone approaching a
  // building actually needs it.
  const doorParts = [
    stop.houseNo && `House ${stop.houseNo}`,
    stop.buildingName, stop.wing && `Wing ${stop.wing}`,
    stop.block && `Block ${stop.block}`, stop.floor && `Floor ${stop.floor}`,
    stop.doorColor && `${stop.doorColor} door`,
    stop.gateNumber && `Gate ${stop.gateNumber}`,
  ].filter(Boolean) as string[];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `Stop ${stop.seq}` }} />
      <Screen scroll>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm, marginBottom: space.md }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="h1">{stop.name}</Text>
            {stop.customerName !== stop.name ? (
              <Text variant="small" tone="muted">Account: {stop.customerName}</Text>
            ) : null}
          </View>
          <Badge label={statusLabel(stop.status)} intent={statusIntent(stop.status)} />
        </View>

        {notice ? (
          <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: colors.mintSoft, borderColor: colors.leaf }}>
            <Text variant="small" tone="brand">{notice}</Text>
          </Card>
        ) : null}
        {error ? (
          <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: "rgba(214,69,61,0.08)", borderColor: "rgba(214,69,61,0.3)" }}>
            <Text variant="small" tone="danger">{error}</Text>
          </Card>
        ) : null}

        {/* address */}
        <Card style={{ marginBottom: space.md }}>
          <Text variant="label" tone="muted">Deliver to</Text>
          <Text variant="body" style={{ marginTop: space.xs }}>{stop.address}</Text>
          {doorParts.length ? (
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>{doorParts.join(" · ")}</Text>
          ) : null}
          {stop.landmark ? <Text variant="small" tone="muted">Landmark: {stop.landmark}</Text> : null}
          {stop.instructions ? (
            <View style={{ marginTop: space.md, padding: space.md, backgroundColor: colors.goldSoft, borderRadius: radius.sm }}>
              <Text variant="label" tone="muted">Customer note</Text>
              <Text variant="small" style={{ marginTop: 2 }}>{stop.instructions}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.base }}>
            <Button label="Navigate" onPress={navigate} variant="secondary" size="sm" />
            {stop.mobile ? (
              <Button label="Call customer" variant="ghost" size="sm" onPress={() => Linking.openURL(`tel:${stop.mobile}`).catch(() => {})} />
            ) : null}
          </View>
        </Card>

        {/* order */}
        <Card style={{ marginBottom: space.md }}>
          <Text variant="label" tone="muted">Order</Text>
          <Row label="Plan" value={stop.plan} />
          {stop.itemLabel ? <Row label="Item" value={`${stop.qty} × ${stop.itemLabel}`} /> : null}
          <Row label="Bottles to hand over" value={String(stop.bottlesExpected)} />
          <Row label="Payment" value={stop.payment} emphasis={stop.payment.startsWith("COD")} />
          {stop.slot ? <Row label="Slot" value={stop.slot} /> : null}
        </Card>

        {/* bottle collection */}
        {!done ? (
          <Card style={{ marginBottom: space.md }}>
            <Text variant="label" tone="muted">Empty bottles collected</Text>
            <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
              Affects the customer&apos;s deposit and loyalty points.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.base, marginTop: space.md }}>
              <Stepper
                value={bottlesIn ?? 0}
                onChange={(v) => setBottlesIn(v)}
              />
              <Text variant="caption" tone="muted">Expected {stop.bottlesExpected}</Text>
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: space.md }}>
            <Row label="Empties collected" value={String(stop.bottlesCollected)} />
            {stop.deliveredAt ? <Row label="Delivered at" value={new Date(stop.deliveredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} /> : null}
          </Card>
        )}

        {/* actions */}
        {!done ? (
          <View style={{ gap: space.sm }}>
            {stop.status === "assigned" ? (
              <Button label="Start delivery" onPress={() => void act("OUT_FOR_DELIVERY")} loading={busy === "OUT_FOR_DELIVERY"} fullWidth />
            ) : null}
            {stop.status === "onway" ? (
              <Button label="I've reached" onPress={() => void act("REACHED")} loading={busy === "REACHED"} fullWidth />
            ) : null}

            <Button label="Mark delivered" onPress={confirmDelivered} loading={busy === "DELIVERED"} fullWidth />

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button
                label="Customer not available"
                variant="secondary"
                size="sm"
                onPress={() => confirmFailed("SKIPPED", "Customer not available")}
                style={{ flex: 1 }}
              />
              <Button
                label="Delivery failed"
                variant="danger"
                size="sm"
                onPress={() => confirmFailed("FAILED", "Delivery failed")}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const { space, colors } = useTheme();
  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      gap: space.md, paddingVertical: space.sm,
      borderBottomWidth: 1, borderBottomColor: colors.line,
    }}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant={emphasis ? "bodyMed" : "small"} tone={emphasis ? "warning" : "default"} style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

/** Big +/- targets — this is tapped with one hand, often in the rain. */
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { colors, radius, space } = useTheme();
  const btn = {
    width: 48, height: 48, borderRadius: radius.sm,
    backgroundColor: colors.mintSoft,
    alignItems: "center" as const, justifyContent: "center" as const,
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={btn} accessibilityRole="button" accessibilityLabel="One fewer bottle">
        <Text variant="h2" tone="brand">−</Text>
      </Pressable>
      <Text variant="h1" style={{ minWidth: 40, textAlign: "center" }}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} style={btn} accessibilityRole="button" accessibilityLabel="One more bottle">
        <Text variant="h2" tone="brand">+</Text>
      </Pressable>
    </View>
  );
}
