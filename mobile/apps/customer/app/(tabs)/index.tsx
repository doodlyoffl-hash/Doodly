/* =============================================================
   DOODLY Customer — home.
   Ordered by what a milk customer actually opens the app to check:
   today's delivery first, then the subscription, then money. Browsing
   comes last because a subscriber already knows what they buy.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import {
  useAuth, getAccountSummary, orderStatus, ApiError,
  type AccountSummary,
} from "@doodly/core";

export default function HomeScreen() {
  const { colors, space, radius } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [live, setLive] = useState<{ active: boolean; stage?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Both are independent; one failing shouldn't blank the other.
      const [s, l] = await Promise.allSettled([getAccountSummary(), orderStatus()]);
      if (s.status === "fulfilled") setSummary(s.value);
      else if (!(s.reason instanceof ApiError && s.reason.code === "offline")) {
        setError("Couldn't refresh your dashboard.");
      }
      if (l.status === "fulfilled") setLive(l.value);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const firstName = (summary?.name ?? user?.name ?? "there").split(" ")[0];
  const sub = summary?.activeSubscription;

  return (
    <Screen scroll onRefresh={load} refreshing={loading && !!summary}>
      <View style={{ marginBottom: space.lg, gap: 2 }}>
        <Text variant="small" tone="muted">Good morning</Text>
        <Text variant="h1">{firstName}</Text>
      </View>

      {error ? (
        <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: "rgba(214,69,61,0.08)", borderColor: "rgba(214,69,61,0.3)" }}>
          <Text variant="small" tone="danger">{error}</Text>
        </Card>
      ) : null}

      {/* live order banner — only when something is genuinely in flight */}
      {live?.active ? (
        <Card style={{ marginBottom: space.md, backgroundColor: colors.forest, borderColor: colors.forest }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Ionicons name="bicycle-outline" size={24} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>Right now</Text>
              <Text variant="h3" tone="onBrand">{statusLabel(live.stage ?? "On the way")}</Text>
            </View>
            <Pressable onPress={() => router.push("/track")} hitSlop={8}>
              <Text variant="small" style={{ color: colors.mint }}>Track</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* today's delivery */}
      <Card style={{ marginBottom: space.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm }}>
          <Text variant="label" tone="muted">Next delivery</Text>
          {summary?.nextDelivery ? (
            <Badge label={statusLabel(summary.nextDelivery.status)} intent={statusIntent(summary.nextDelivery.status)} />
          ) : null}
        </View>
        {summary?.nextDelivery ? (
          <>
            <Text variant="h2">{formatDay(summary.nextDelivery.date)}</Text>
            {summary.nextDelivery.slot ? (
              <Text variant="small" tone="muted" style={{ marginTop: 2 }}>{summary.nextDelivery.slot}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text variant="body" tone="muted">No delivery scheduled</Text>
            <Button label="Start a subscription" onPress={() => router.push("/shop")} style={{ marginTop: space.base }} />
          </>
        )}
      </Card>

      {/* active subscription */}
      {sub ? (
        <Card style={{ marginBottom: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="muted">Your subscription</Text>
              <Text variant="h3" style={{ marginTop: 2 }}>{sub.planName}</Text>
            </View>
            <Badge label={statusLabel(sub.status)} intent={statusIntent(sub.status)} />
          </View>
          {sub.items.length ? (
            <Text variant="small" tone="muted" style={{ marginTop: space.sm }}>
              {sub.items.map((i) => `${i.qty} × ${i.label} ${i.product}`).join(", ")}
            </Text>
          ) : null}
          <Button
            label="Manage"
            variant="secondary"
            size="sm"
            onPress={() => router.push(`/subscription/${sub.id}`)}
            style={{ marginTop: space.base }}
          />
        </Card>
      ) : null}

      {/* money row */}
      <View style={{ flexDirection: "row", gap: space.md, marginBottom: space.md }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push("/wallet")}>
          <Card>
            <Text variant="label" tone="muted">Wallet</Text>
            <Money paise={summary?.walletPaise ?? 0} variant="h2" style={{ marginTop: space.xs }} />
          </Card>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push("/rewards")}>
          <Card>
            <Text variant="label" tone="muted">Points</Text>
            <Text variant="h2" style={{ marginTop: space.xs }}>{summary?.loyaltyPoints ?? 0}</Text>
          </Card>
        </Pressable>
      </View>

      {/* bottles — a real obligation for a milk customer, not a vanity stat */}
      {summary && summary.bottlesPending > 0 ? (
        <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
          <Text variant="small" tone="muted">
            You have <Text variant="bodyMed">{summary.bottlesPending}</Text> bottle
            {summary.bottlesPending === 1 ? "" : "s"} to return. Hand them to your delivery executive
            to get your deposit back.
          </Text>
        </Card>
      ) : null}

      {/* referral */}
      <Pressable onPress={() => router.push("/refer")}>
        <Card style={{ backgroundColor: colors.mintSoft, borderColor: colors.mint }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Ionicons name="gift-outline" size={22} color={colors.leaf600} />
            <View style={{ flex: 1 }}>
              <Text variant="h3" tone="brand">Refer a friend</Text>
              <Text variant="small" tone="muted">Both of you get wallet credit.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
          </View>
        </Card>
      </Pressable>
    </Screen>
  );
}

/** "Tomorrow" reads better than a date for the delivery a customer is
 *  actually waiting on. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const days = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
