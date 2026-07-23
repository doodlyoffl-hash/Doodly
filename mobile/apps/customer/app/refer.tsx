/* DOODLY Customer — referrals.
   Share links must point at the storefront's .html path: DOODLY serves
   pages at their .html URL only, so /signup would 404 where
   /signup.html?ref=CODE works. The server already returns a correct
   shareUrl — we prefer it and only build one as a fallback. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Share, Pressable, Alert } from "react-native";
import { Stack } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { getReferrals, type Referrals } from "@doodly/core";

export default function ReferScreen() {
  const { colors, space, radius } = useTheme();
  const [data, setData] = useState<Referrals | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await getReferrals()); }
    catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const url = data?.shareUrl || (data?.code ? `https://doodly.in/signup.html?ref=${data.code}` : "");

  async function share() {
    if (!url) return;
    try {
      await Share.share({
        message: `I get farm-fresh A2 milk delivered every morning with DOODLY. Use my code ${data?.code} to get started: ${url}`,
      });
    } catch { /* user dismissed */ }
  }

  async function copy() {
    if (!data?.code) return;
    await Clipboard.setStringAsync(data.code);
    Alert.alert("Copied", "Your referral code is on the clipboard.");
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Refer a friend" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <Card style={{ backgroundColor: colors.forest, borderColor: colors.forest, marginBottom: space.lg }}>
          <Ionicons name="gift-outline" size={28} color={colors.mint} />
          <Text variant="h2" tone="onBrand" style={{ marginTop: space.sm }}>Give ₹, get ₹</Text>
          <Text variant="small" style={{ color: "rgba(255,255,255,0.75)", marginTop: space.xs }}>
            Your friend gets credit on their first order, and so do you once they&apos;ve been delivered to.
          </Text>
        </Card>

        {data?.code ? (
          <Card style={{ marginBottom: space.lg }}>
            <Text variant="label" tone="muted">Your code</Text>
            <Pressable onPress={copy} style={{
              marginTop: space.sm, paddingVertical: space.base,
              borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed",
              borderColor: colors.leaf, backgroundColor: colors.mintSoft,
              alignItems: "center",
            }}>
              <Text variant="h2" tone="brand" style={{ letterSpacing: 2 }}>{data.code}</Text>
              <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>Tap to copy</Text>
            </Pressable>
            <Button label="Share invite" onPress={share} fullWidth style={{ marginTop: space.base }} />
          </Card>
        ) : null}

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Your referrals</Text>
        {data?.referred?.length ? (
          <View style={{ gap: space.sm }}>
            {data.referred.map((r, i) => (
              <Card key={i} elevated={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="small">{r.name ?? "A friend"}</Text>
                    <Text variant="caption" tone="subtle">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Badge label={statusLabel(r.status)} intent={statusIntent(r.status)} />
                  {r.rewardPaise ? <Money paise={r.rewardPaise} variant="small" tone="success" /> : null}
                </View>
              </Card>
            ))}
          </View>
        ) : !loading ? (
          <Card>
            <Text variant="small" tone="muted" center>
              No referrals yet. Share your code to get started.
            </Text>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}
