/* =============================================================
   DOODLY Customer — notification preferences.
   These map 1:1 to CustomerPreference on the server, which notify()
   consults before every send. Turning push off here genuinely stops
   pushes — it isn't a client-side mute.

   Transactional messages about a delivery in progress are deliberately
   NOT switchable: someone who turned everything off and then wondered
   where their milk was would be a worse outcome than one extra message.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, Switch, Alert } from "react-native";
import { Stack } from "expo-router";
import { Screen, Card, Text, useTheme } from "@doodly/ui";
import { getSettings, updateSettings, type NotificationSettings } from "@doodly/core";

type Key = "pushOptIn" | "whatsappOptIn" | "smsOptIn" | "emailOptIn" | "marketingOptIn";

const ROWS: { key: Key; title: string; blurb: string }[] = [
  { key: "pushOptIn", title: "Push notifications", blurb: "Delivery updates and order confirmations on this device." },
  { key: "whatsappOptIn", title: "WhatsApp", blurb: "Order and delivery updates on WhatsApp." },
  { key: "smsOptIn", title: "SMS", blurb: "Text messages for important updates." },
  { key: "emailOptIn", title: "Email", blurb: "Invoices, receipts and delivery summaries." },
  { key: "marketingOptIn", title: "Offers & news", blurb: "Occasional offers. Never more than a few a month." },
];

export default function NotificationSettingsScreen() {
  const { colors, space } = useTheme();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Key | null>(null);

  const load = useCallback(async () => {
    try { setSettings(await getSettings()); }
    catch { /* rows render disabled */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(key: Key, value: boolean) {
    if (!settings) return;
    // Optimistic: a switch that lags behind the finger feels broken.
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(key);
    try {
      const updated = await updateSettings({ [key]: value });
      setSettings(updated);
    } catch (e) {
      setSettings(previous);   // roll back so the UI never lies about server state
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    } finally { setSaving(null); }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Notifications" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <Card padded={false} style={{ overflow: "hidden", marginBottom: space.md }}>
          {ROWS.map((r, i) => (
            <View
              key={r.key}
              style={{
                flexDirection: "row", alignItems: "center", gap: space.md,
                paddingHorizontal: space.base, paddingVertical: space.base,
                borderBottomWidth: i === ROWS.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyMed">{r.title}</Text>
                <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>{r.blurb}</Text>
              </View>
              <Switch
                value={!!settings?.[r.key]}
                onValueChange={(v) => toggle(r.key, v)}
                disabled={!settings || saving === r.key}
                trackColor={{ true: colors.leaf, false: colors.line }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </Card>

        <Text variant="caption" tone="subtle">
          We&apos;ll always tell you about a delivery that&apos;s on its way or a payment
          that failed, whatever these are set to.
        </Text>
      </Screen>
    </>
  );
}
