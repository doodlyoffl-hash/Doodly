/* =============================================================
   DOODLY Customer — account.
   A plain list of destinations. Sign-out unregisters this device's push
   token first: otherwise a handed-over or resold phone keeps receiving
   the previous owner's delivery notifications.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, Alert } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Button, useTheme } from "@doodly/ui";
import { useAuth, getAccountSummary, type AccountSummary } from "@doodly/core";

interface Row { label: string; icon: keyof typeof Ionicons.glyphMap; href: Href }

const ROWS: Row[] = [
  { label: "My subscriptions", icon: "repeat-outline", href: "/subscriptions" },
  { label: "Delivery addresses", icon: "location-outline", href: "/addresses" },
  { label: "Wallet & transactions", icon: "wallet-outline", href: "/wallet" },
  { label: "Rewards", icon: "star-outline", href: "/rewards" },
  { label: "Refer a friend", icon: "gift-outline", href: "/refer" },
  { label: "Invoices", icon: "document-text-outline", href: "/invoices" },
  { label: "Bottle returns", icon: "cube-outline", href: "/bottles" },
  { label: "Notifications", icon: "notifications-outline", href: "/settings/notifications" },
  { label: "Help & support", icon: "help-circle-outline", href: "/support" },
];

export default function AccountScreen() {
  const { colors, space } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  const load = useCallback(async () => {
    try { setSummary(await getAccountSummary()); } catch { /* header is optional */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to sign in again to see your orders.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen scroll onRefresh={load}>
      <Text variant="h1" style={{ marginBottom: space.base }}>Account</Text>

      <Card style={{ marginBottom: space.lg }}>
        <Text variant="h3">{summary?.name ?? user?.name ?? "DOODLY Customer"}</Text>
        {user?.phone ? <Text variant="small" tone="muted" style={{ marginTop: 2 }}>+{user.phone}</Text> : null}
        {user?.email ? <Text variant="small" tone="muted">{user.email}</Text> : null}

        <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.base }}>
          <View>
            <Text variant="label" tone="muted">Wallet</Text>
            <Money paise={summary?.walletPaise ?? 0} variant="bodyMed" />
          </View>
          <View>
            <Text variant="label" tone="muted">Points</Text>
            <Text variant="bodyMed">{summary?.loyaltyPoints ?? 0}</Text>
          </View>
          <View>
            <Text variant="label" tone="muted">Bottles out</Text>
            <Text variant="bodyMed">{summary?.bottlesPending ?? 0}</Text>
          </View>
        </View>

        <Button label="Edit profile" variant="secondary" size="sm" onPress={() => router.push("/profile")} style={{ marginTop: space.base }} />
      </Card>

      <Card padded={false} style={{ marginBottom: space.lg, overflow: "hidden" }}>
        {ROWS.map((r, i) => (
          <Pressable
            key={r.label}
            onPress={() => router.push(r.href)}
            style={{
              flexDirection: "row", alignItems: "center", gap: space.md,
              paddingHorizontal: space.base, paddingVertical: 14,
              borderBottomWidth: i === ROWS.length - 1 ? 0 : 1,
              borderBottomColor: colors.line,
            }}
            accessibilityRole="button"
            accessibilityLabel={r.label}
          >
            <Ionicons name={r.icon} size={20} color={colors.leaf} />
            <Text variant="body" style={{ flex: 1 }}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </Pressable>
        ))}
      </Card>

      <Button label="Sign out" variant="ghost" onPress={confirmSignOut} fullWidth />
    </Screen>
  );
}
