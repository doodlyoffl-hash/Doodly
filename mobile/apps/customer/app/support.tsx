/* DOODLY Customer — help & support.
   Raises a real SupportTicket through the existing endpoint. Calling and
   WhatsApp are offered first because a milk problem is same-morning
   urgent — a ticket that gets read this afternoon doesn't help someone
   whose delivery didn't arrive. */
import React, { useCallback, useEffect, useState } from "react";
import { View, TextInput, Linking, Alert, Pressable } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Button, Badge, useTheme, statusIntent, statusLabel } from "@doodly/ui";
import { api, ApiError } from "@doodly/core";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

const SUPPORT_PHONE = "919100000000";   // replace with the published support line

export default function SupportScreen() {
  const { colors, space, radius } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ tickets: Ticket[] } | Ticket[]>("/api/account/support");
      setTickets(Array.isArray(r) ? r : r.tickets);
    } catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setError(null);
    if (subject.trim().length < 3) { setError("Give your request a short subject."); return; }
    if (message.trim().length < 10) { setError("Tell us a little more so we can help."); return; }
    setBusy(true);
    try {
      await api.post("/api/account/support", { subject: subject.trim(), message: message.trim() });
      setSubject(""); setMessage("");
      Alert.alert("Sent", "We've received your request and will get back to you.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send that. Please try again.");
    } finally { setBusy(false); }
  }

  const input = {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.sm, paddingHorizontal: space.base, paddingVertical: 12,
    color: colors.ink, fontFamily: "HankenGrotesk_400Regular", fontSize: 15,
  } as const;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Help & support" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        <View style={{ flexDirection: "row", gap: space.md, marginBottom: space.lg }}>
          <QuickAction
            icon="call-outline" label="Call us"
            onPress={() => Linking.openURL(`tel:+${SUPPORT_PHONE}`).catch(() => {})}
          />
          <QuickAction
            icon="logo-whatsapp" label="WhatsApp"
            onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE}`).catch(() => {})}
          />
        </View>

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Raise a request</Text>
        <Card style={{ marginBottom: space.lg }}>
          <View style={{ gap: space.md }}>
            <TextInput
              value={subject} onChangeText={setSubject} style={input}
              placeholder="What's it about?" placeholderTextColor={colors.ink3} editable={!busy}
            />
            <TextInput
              value={message} onChangeText={setMessage}
              style={[input, { height: 110, textAlignVertical: "top" }]}
              placeholder="Tell us what happened…" placeholderTextColor={colors.ink3}
              multiline editable={!busy}
            />
            {error ? <Text variant="small" tone="danger">{error}</Text> : null}
            <Button label="Send request" onPress={submit} loading={busy} disabled={busy} fullWidth />
          </View>
        </Card>

        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Your requests</Text>
        {tickets.length ? (
          <View style={{ gap: space.sm }}>
            {tickets.map((t) => (
              <Card key={t.id} elevated={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="small">{t.subject}</Text>
                    <Text variant="caption" tone="subtle">
                      {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Badge label={statusLabel(t.status)} intent={statusIntent(t.status)} />
                </View>
              </Card>
            ))}
          </View>
        ) : !loading ? (
          <Card><Text variant="small" tone="muted" center>No requests yet.</Text></Card>
        ) : null}
      </Screen>
    </>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      <View style={{
        alignItems: "center", gap: space.sm, paddingVertical: space.lg,
        backgroundColor: colors.mintSoft, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.line,
      }}>
        <Ionicons name={icon} size={24} color={colors.leaf600} />
        <Text variant="small" tone="brand">{label}</Text>
      </View>
    </Pressable>
  );
}
