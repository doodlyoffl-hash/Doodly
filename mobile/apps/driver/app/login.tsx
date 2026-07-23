/* =============================================================
   DOODLY Delivery — sign in.
   Email + password against POST /api/token, which is what the backend
   supports today. (Phone + OTP arrives with the Phase-2 backend work;
   this screen gains a second tab then, not a rewrite.)
   ============================================================= */
import React, { useState } from "react";
import { TextInput, View, Pressable } from "react-native";
import { Screen, Card, Text, Button, useTheme } from "@doodly/ui";
import { useAuth, ApiError, WrongAppError } from "@doodly/core";

export default function LoginScreen() {
  const { colors, radius, space } = useTheme();
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      // The Gate in _layout.tsx routes on status change — no navigation here.
    } catch (e) {
      // Distinguish the three failures a driver can actually hit, because
      // "something went wrong" tells them nothing about what to do next.
      if (e instanceof WrongAppError) setError(e.message);
      else if (e instanceof ApiError && e.code === "offline") setError("No internet connection. Check your signal and try again.");
      else if (e instanceof ApiError && e.status === 429) setError(e.message);
      else if (e instanceof ApiError && e.status === 401) setError("Incorrect email or password.");
      else setError(e instanceof Error ? e.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.base,
    paddingVertical: 14,
    color: colors.ink,
    fontFamily: "HankenGrotesk_400Regular",
    fontSize: 16,
  } as const;

  return (
    <Screen scroll>
      <View style={{ gap: space.sm, marginTop: space.xxl, marginBottom: space.xl }}>
        <Text variant="hero">DOODLY</Text>
        <Text variant="h3" tone="brand">Delivery Executive</Text>
        <Text variant="small" tone="muted">
          Sign in to see today&apos;s route, update stops and record bottle collection.
        </Text>
      </View>

      <Card>
        <View style={{ gap: space.base }}>
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="muted">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={field}
              placeholder="you@doodly.in"
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              editable={!busy}
              returnKeyType="next"
            />
          </View>

          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="muted">Password</Text>
            <View style={{ justifyContent: "center" }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={[field, { paddingRight: 68 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.ink3}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable
                onPress={() => setShowPw((v) => !v)}
                style={{ position: "absolute", right: space.md, padding: space.sm }}
                accessibilityRole="button"
                accessibilityLabel={showPw ? "Hide password" : "Show password"}
              >
                <Text variant="caption" tone="brand">{showPw ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={{
              backgroundColor: "rgba(214,69,61,0.10)",
              borderRadius: radius.sm,
              padding: space.md,
            }}>
              <Text variant="small" tone="danger">{error}</Text>
            </View>
          ) : null}

          <Button label="Sign in" onPress={submit} loading={busy} disabled={!canSubmit} fullWidth />
        </View>
      </Card>

      <Text variant="caption" tone="subtle" center style={{ marginTop: space.lg }}>
        Trouble signing in? Contact the DOODLY operations team.
      </Text>
    </Screen>
  );
}
