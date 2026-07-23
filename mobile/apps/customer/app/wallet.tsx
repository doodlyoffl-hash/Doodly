/* =============================================================
   DOODLY Customer — wallet.
   Credits arrive from refunds, referral rewards, trial cashback and
   loyalty redemptions, so the transaction list is the customer's proof
   of where their money came from. Sign is derived from the amount, not
   from a label, so a new transaction `type` from the server can never
   render as the wrong direction.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, useTheme } from "@doodly/ui";
import { getWallet, ApiError, type Wallet, type WalletTxn } from "@doodly/core";

export default function WalletScreen() {
  const { colors, space } = useTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setWallet(await getWallet()); }
    catch (e) {
      setError(e instanceof ApiError && e.code === "offline" ? "You're offline." : "Couldn't load your wallet.");
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Wallet" }} />
      <Screen bleed>
        <FlatList
          data={wallet?.transactions ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: space.base, paddingBottom: space.xxl, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.leaf} colors={[colors.leaf]} />}
          ListHeaderComponent={
            <View style={{ marginBottom: space.md }}>
              <Card style={{ backgroundColor: colors.forest, borderColor: colors.forest }}>
                <Text variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>Available balance</Text>
                <Money paise={wallet?.balancePaise ?? 0} variant="hero" tone="onBrand" style={{ marginTop: space.xs }} />
                <Text variant="caption" style={{ color: "rgba(255,255,255,0.6)", marginTop: space.sm }}>
                  Use it at checkout — it applies automatically when you choose to spend it.
                </Text>
              </Card>
              {error ? <Text variant="small" tone="danger" style={{ marginTop: space.sm }}>{error}</Text> : null}
              <Text variant="label" tone="muted" style={{ marginTop: space.lg }}>Transactions</Text>
            </View>
          }
          renderItem={({ item }) => <TxnRow txn={item} />}
          ListEmptyComponent={
            loading ? null : (
              <Card>
                <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
                  <Ionicons name="wallet-outline" size={26} color={colors.ink3} />
                  <Text variant="h3" center>No transactions yet</Text>
                  <Text variant="small" tone="muted" center>
                    Refunds, referral rewards and cashback will appear here.
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

function TxnRow({ txn }: { txn: WalletTxn }) {
  const { colors, space } = useTheme();
  // Direction comes from the sign of the amount — never from the label.
  const credit = txn.amountPaise >= 0;
  return (
    <Card elevated={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: credit ? colors.mintSoft : colors.milk2,
          alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons
            name={credit ? "arrow-down" : "arrow-up"}
            size={16}
            color={credit ? colors.leaf600 : colors.ink3}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="small">{txn.note || prettyType(txn.type)}</Text>
          <Text variant="caption" tone="subtle">
            {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        </View>
        <Money paise={txn.amountPaise} variant="bodyMed" tone={credit ? "success" : "default"} />
      </View>
    </Card>
  );
}

function prettyType(t: string): string {
  const s = String(t || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "Transaction";
}
