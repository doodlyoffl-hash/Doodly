/* DOODLY Customer — profile.
   An OTP-created account starts with the placeholder name "DOODLY
   Customer", so this screen is where most people first tell us who they
   are. Phone is shown read-only: it IS the login identity, and changing
   it needs a fresh OTP against the new number — a separate flow. */
import React, { useCallback, useEffect, useState } from "react";
import { View, TextInput, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Screen, Card, Text, Button, useTheme } from "@doodly/ui";
import { getProfile, updateProfile, ApiError, type Profile } from "@doodly/core";

export default function ProfileScreen() {
  const { colors, space, radius } = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getProfile();
      setProfile(p);
      // Don't prefill the placeholder — it reads as if they already named
      // themselves, and they'd have to clear it to type a real name.
      setName(p.name && p.name !== "DOODLY Customer" ? p.name : "");
      setEmail(p.email ?? "");
    } catch { /* form still usable */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setError(null);
    if (name.trim().length < 2) { setError("Please enter your name."); return; }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("That email doesn't look right."); return;
    }
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() || null });
      Alert.alert("Saved", "Your profile has been updated.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your profile.");
    } finally { setBusy(false); }
  }

  const input = {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.sm, paddingHorizontal: space.base, paddingVertical: 12,
    color: colors.ink, fontFamily: "HankenGrotesk_400Regular", fontSize: 15,
  } as const;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Profile" }} />
      <Screen scroll>
        <Card>
          <View style={{ gap: space.md }}>
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="muted">Your name</Text>
              <TextInput
                value={name} onChangeText={setName} style={input}
                placeholder="Full name" placeholderTextColor={colors.ink3}
                editable={!busy && !loading} autoCapitalize="words" textContentType="name"
              />
            </View>

            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="muted">Email (optional)</Text>
              <TextInput
                value={email} onChangeText={setEmail} style={input}
                placeholder="you@example.com" placeholderTextColor={colors.ink3}
                editable={!busy && !loading} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" textContentType="emailAddress"
              />
              <Text variant="caption" tone="subtle">We&apos;ll send invoices and delivery summaries here.</Text>
            </View>

            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="muted">Mobile number</Text>
              <View style={[input, { backgroundColor: colors.milk2 }]}>
                <Text variant="small" tone="muted">{profile?.phone ? `+${profile.phone}` : "—"}</Text>
              </View>
              <Text variant="caption" tone="subtle">
                This is how you sign in. Contact support to change it.
              </Text>
            </View>

            {error ? <Text variant="small" tone="danger">{error}</Text> : null}

            <Button label="Save changes" onPress={save} loading={busy} disabled={busy || loading} fullWidth />
          </View>
        </Card>
      </Screen>
    </>
  );
}
