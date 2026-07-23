/* =============================================================
   DOODLY Customer — invoices.
   The PDF endpoint streams binary with Content-Disposition, which a
   browser would handle for free. There is no download manager here, so
   the app fetches it WITH the auth header, writes it to the app's
   document directory, and opens the OS share sheet — that's what lets
   someone actually save or email their invoice.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, Alert } from "react-native";
import { Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, useTheme } from "@doodly/ui";
import { listInvoices, invoicePdfUrl, apiBase, getToken, type Invoice } from "@doodly/core";

export default function InvoicesScreen() {
  const { colors, space } = useTheme();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInvoices(await listInvoices()); }
    catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function download(inv: Invoice) {
    setDownloading(inv.id);
    try {
      const token = await getToken();
      const target = `${FileSystem.documentDirectory}DOODLY-invoice-${inv.number}.pdf`;
      const res = await FileSystem.downloadAsync(apiBase() + invoicePdfUrl(inv.id), target, {
        // Without this the endpoint 401s — there is no cookie to fall back on.
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status !== 200) throw new Error(`Server returned ${res.status}`);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("Downloaded", `Saved as DOODLY-invoice-${inv.number}.pdf`);
      }
    } catch (e) {
      Alert.alert("Couldn't download", e instanceof Error ? e.message : "Please try again.");
    } finally { setDownloading(null); }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Invoices" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <View style={{ gap: space.sm }}>
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Ionicons name="document-text-outline" size={22} color={colors.leaf} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMed">{inv.number}</Text>
                  <Text variant="caption" tone="subtle">
                    {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Money paise={inv.totalPaise} variant="small" />
                <Pressable onPress={() => download(inv)} hitSlop={10} disabled={downloading === inv.id} accessibilityLabel={`Download invoice ${inv.number}`}>
                  <Ionicons
                    name={downloading === inv.id ? "hourglass-outline" : "download-outline"}
                    size={20}
                    color={downloading === inv.id ? colors.ink3 : colors.leaf}
                  />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>

        {!loading && !invoices.length ? (
          <Card>
            <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
              <Ionicons name="document-text-outline" size={26} color={colors.ink3} />
              <Text variant="h3" center>No invoices yet</Text>
              <Text variant="small" tone="muted" center>An invoice is created for every paid order.</Text>
            </View>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}
