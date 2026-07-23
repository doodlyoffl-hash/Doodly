/* =============================================================
   DOODLY Customer — manage a subscription.
   Pause / resume / skip a day / cancel. Every one of these changes what
   arrives at someone's door tomorrow morning, so each is confirmed
   before it fires, and the destructive one (cancel) is styled and worded
   as destructive.

   The server owns the rules — cut-off times, notice periods, refunds.
   This screen sends intent and renders whatever the server decides.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import {
  listSubscriptions, subscriptionAction, ApiError,
  type Subscription, type SubscriptionAction,
} from "@doodly/core";

export default function ManageSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space } = useTheme();
  const router = useRouter();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<SubscriptionAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listSubscriptions();
      setSub(all.find((s) => s.id === id) ?? null);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "offline")) setError("Couldn't load this subscription.");
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: SubscriptionAction, extra: { date?: string } = {}) {
    setBusy(action); setError(null); setNotice(null);
    try {
      await subscriptionAction(id, action, extra);
      setNotice(MESSAGES[action]);
      await load();
      if (action === "cancel") setTimeout(() => router.back(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally { setBusy(null); }
  }

  function confirm(action: SubscriptionAction, title: string, body: string, destructive = false) {
    Alert.alert(title, body, [
      { text: "Not now", style: "cancel" },
      { text: destructive ? "Yes, cancel" : "Confirm", style: destructive ? "destructive" : "default", onPress: () => void run(action) },
    ]);
  }

  /** Tomorrow in ISO — the earliest day a skip can sensibly apply. */
  function tomorrowIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Subscription" }} />
        <Screen><Text tone="muted">Loading…</Text></Screen>
      </>
    );
  }

  if (!sub) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Subscription" }} />
        <Screen>
          <Card>
            <Text variant="h3">Not found</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>{error ?? "This subscription no longer exists."}</Text>
            <Button label="Back" onPress={() => router.back()} style={{ marginTop: space.base }} />
          </Card>
        </Screen>
      </>
    );
  }

  const status = String(sub.status).toUpperCase();
  const paused = status === "PAUSED";
  const cancelled = status === "CANCELLED";

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: sub.planName }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: space.lg }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="h1">{sub.planName}</Text>
            {sub.items.length ? (
              <Text variant="small" tone="muted">
                {sub.items.map((i) => `${i.qty} × ${i.label} ${i.product}`).join(", ")}
              </Text>
            ) : null}
          </View>
          <Badge label={statusLabel(sub.status)} intent={statusIntent(sub.status)} />
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

        <Card style={{ marginBottom: space.md }}>
          {sub.nextDeliveryAt ? (
            <Row icon="calendar-outline" label="Next delivery"
              value={new Date(sub.nextDeliveryAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} />
          ) : null}
          {sub.slot ? <Row icon="time-outline" label="Slot" value={sub.slot} /> : null}
          {sub.address ? (
            <Row icon="location-outline" label="Delivering to"
              value={[sub.address.line1, sub.address.city, sub.address.pincode].filter(Boolean).join(", ")} />
          ) : null}
        </Card>

        {!cancelled ? (
          <View style={{ gap: space.sm }}>
            <Button
              label="Skip tomorrow"
              variant="secondary"
              onPress={() => Alert.alert(
                "Skip tomorrow?",
                "No delivery will be made tomorrow. Your plan shifts by a day rather than losing it.",
                [{ text: "Not now", style: "cancel" }, { text: "Skip", onPress: () => void run("skip", { date: tomorrowIso() }) }],
              )}
              loading={busy === "skip"}
              fullWidth
            />

            {paused ? (
              <Button label="Resume deliveries" onPress={() => confirm("resume", "Resume deliveries?", "We'll start delivering again from the next available day.")} loading={busy === "resume"} fullWidth />
            ) : (
              <Button label="Pause deliveries" variant="secondary" onPress={() => confirm("pause", "Pause deliveries?", "We'll stop delivering until you resume. Your remaining days are kept.")} loading={busy === "pause"} fullWidth />
            )}

            <Button
              label="Cancel subscription"
              variant="danger"
              onPress={() => confirm("cancel", "Cancel this subscription?", "This ends your deliveries. Any remaining balance is handled per DOODLY's refund policy.", true)}
              loading={busy === "cancel"}
              fullWidth
            />
          </View>
        ) : (
          <Card>
            <Text variant="small" tone="muted">This subscription has been cancelled.</Text>
          </Card>
        )}

        <Button label="Change delivery address" variant="ghost" onPress={() => router.push("/addresses")} fullWidth style={{ marginTop: space.md }} />
      </Screen>
    </>
  );
}

const MESSAGES: Record<SubscriptionAction, string> = {
  pause: "Deliveries paused. Resume any time.",
  resume: "Deliveries resumed.",
  skip: "Tomorrow's delivery will be skipped.",
  cancel: "Subscription cancelled.",
};

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", paddingVertical: space.sm }}>
      <Ionicons name={icon} size={18} color={colors.leaf} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="subtle">{label}</Text>
        <Text variant="small">{value}</Text>
      </View>
    </View>
  );
}
