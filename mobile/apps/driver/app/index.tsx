/* =============================================================
   DOODLY Delivery — today's dashboard.
   Answers, in one glance and before any scrolling: am I on shift, how
   many stops are left, and is anything still waiting to sync.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Card, Text, Money, Button, Badge, useTheme } from "@doodly/ui";
import {
  useAuth, getDriverSummary, getAvailability, setAvailability, onQueueChange,
  onConnectivityChange, sync, ApiError,
  type DriverSummary, type Availability,
} from "@doodly/core";

export default function DashboardScreen() {
  const { colors, space, radius } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [summary, setSummary] = useState<DriverSummary | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([getDriverSummary(), getAvailability()]);
      setSummary(s);
      setAvail(a);
    } catch (e) {
      // Offline is not an error state worth shouting about — the banner
      // already says so, and cached numbers stay on screen.
      if (!(e instanceof ApiError && e.code === "offline")) {
        setError(e instanceof Error ? e.message : "Could not load today's summary.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onQueueChange(({ pending }) => setPending(pending)), []);
  useEffect(() => onConnectivityChange(setOnline), []);

  async function toggleShift() {
    if (!avail) return;
    setToggling(true);
    setError(null);
    try {
      const next = await setAvailability(!avail.available);
      setAvail(next);
      // Starting a shift triggers the server's auto-assignment sweep, so the
      // stop counts change moments later.
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError("Finish your current trip before going offline.");
      else setError(e instanceof Error ? e.message : "Could not update your shift.");
    } finally {
      setToggling(false);
    }
  }

  const onShift = !!avail?.available;
  const firstName = (user?.name ?? summary?.name ?? "there").split(" ")[0];

  return (
    <Screen scroll onRefresh={load} refreshing={loading && !!summary}>
      {/* greeting + identity */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h1">Hello, {firstName}</Text>
          {summary?.employeeId ? <Text variant="small" tone="muted">{summary.employeeId}</Text> : null}
        </View>
        <Pressable onPress={signOut} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text variant="small" tone="brand">Sign out</Text>
        </Pressable>
      </View>

      {/* connectivity + pending sync */}
      {!online || pending > 0 ? (
        <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
          <Text variant="small" tone="muted">
            {!online ? "You're offline. " : ""}
            {pending > 0
              ? `${pending} ${pending === 1 ? "update is" : "updates are"} waiting to sync.`
              : "Updates will sync automatically when you're back online."}
          </Text>
          {online && pending > 0 ? (
            <Button label="Sync now" variant="ghost" size="sm" onPress={() => void sync()} style={{ marginTop: space.sm }} />
          ) : null}
        </Card>
      ) : null}

      {/* shift toggle — the single most important control on this screen */}
      <Card style={{ marginBottom: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="h3">{onShift ? "You're on shift" : "You're off shift"}</Text>
            <Text variant="small" tone="muted">
              {onShift
                ? "You'll be assigned deliveries automatically."
                : "Start your shift to receive today's deliveries."}
            </Text>
          </View>
          <Badge label={onShift ? "Available" : "Offline"} intent={onShift ? "success" : "neutral"} />
        </View>
        <Button
          label={onShift ? "End shift" : "Start shift"}
          variant={onShift ? "secondary" : "primary"}
          onPress={toggleShift}
          loading={toggling}
          fullWidth
          style={{ marginTop: space.base }}
        />
      </Card>

      {error ? (
        <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: "rgba(214,69,61,0.08)", borderColor: "rgba(214,69,61,0.3)" }}>
          <Text variant="small" tone="danger">{error}</Text>
        </Card>
      ) : null}

      {/* today's numbers */}
      <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Today</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginBottom: space.md }}>
        <Stat label="Stops" value={summary?.stopsToday} />
        <Stat label="Delivered" value={summary?.deliveredToday} tone="success" />
        <Stat label="Pending" value={summary?.pendingToday} tone="warning" />
        <Stat label="Bottles collected" value={summary?.bottlesCollectedToday} />
      </View>

      <Card style={{ marginBottom: space.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="body" tone="muted">Cash collected</Text>
          <Money paise={summary?.cashCollectedPaise ?? 0} variant="h3" />
        </View>
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.md }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="body" tone="muted">Bottles still to collect</Text>
          <Text variant="h3">{summary?.bottlesToCollect ?? 0}</Text>
        </View>
      </Card>

      <Button
        label={summary?.pendingToday ? `View route — ${summary.pendingToday} left` : "View route"}
        onPress={() => router.push("/route")}
        fullWidth
      />
    </Screen>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value?: number; tone?: "default" | "success" | "warning" }) {
  const { space, radius, colors } = useTheme();
  return (
    <View style={{
      flexGrow: 1, flexBasis: "45%",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.line,
      padding: space.base, gap: space.xs,
    }}>
      <Text variant="h1" tone={tone === "default" ? "default" : tone}>{value ?? "—"}</Text>
      <Text variant="caption" tone="muted">{label}</Text>
    </View>
  );
}
