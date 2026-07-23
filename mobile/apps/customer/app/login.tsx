/* =============================================================
   DOODLY Customer — sign in.
   Mobile number + OTP is the primary path (what Indian D2C customers
   expect), with Apple Sign-In offered on iOS.

   Two deliberate UX decisions:
   • The number is entered as 10 digits with a fixed +91 prefix, not a
     free-text field. It removes the commonest failure (typing +91 twice)
     and makes validation unambiguous.
   • The resend timer starts from the server's `retryAfterSec`, never a
     local guess — the server is the one enforcing the throttle, so a
     local countdown that disagrees would show "Resend" on a button that
     then fails.
   ============================================================= */
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Screen, Card, Text, Button, useTheme } from "@doodly/ui";
import {
  useAuth, requestOtp, verifyOtp, loginWithApple,
  isValidIndianMobile, ApiError, WrongAppError,
} from "@doodly/core";

type Step = "phone" | "code";

export default function LoginScreen() {
  const { colors, radius, space } = useTheme();
  const { adopt } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // Countdown seeded by the server's retryAfterSec.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function friendly(e: unknown, fallback: string): string {
    if (e instanceof WrongAppError) return e.message;
    if (e instanceof ApiError) {
      if (e.code === "offline") return "No internet connection. Check your signal and try again.";
      return e.message;   // server messages here are already user-facing
    }
    return e instanceof Error ? e.message : fallback;
  }

  async function sendCode() {
    if (!isValidIndianMobile(phone)) { setError("Enter a valid 10-digit mobile number."); return; }
    setBusy(true); setError(null);
    try {
      const r = await requestOtp(phone);
      setCooldown(r.retryAfterSec);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      setError(friendly(e, "Could not send the code. Please try again."));
    } finally { setBusy(false); }
  }

  async function submitCode() {
    if (code.trim().length < 4) return;
    setBusy(true); setError(null);
    try {
      const r = await verifyOtp(phone, code);
      adopt(r.user);
    } catch (e) {
      setError(friendly(e, "Could not verify the code."));
    } finally { setBusy(false); }
  }

  async function signInWithApple() {
    setBusy(true); setError(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new Error("Apple didn't return a sign-in token.");
      // Apple gives the name ONLY on the first authorisation — forward it now
      // or it's gone for good.
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ") || null;
      const r = await loginWithApple(cred.identityToken, name);
      adopt(r.user);
    } catch (e) {
      // The user tapping "Cancel" is not an error worth showing.
      if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") { setBusy(false); return; }
      setError(friendly(e, "Could not sign in with Apple."));
    } finally { setBusy(false); }
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
        <Text variant="h3" tone="brand">Farm-fresh A2 milk, daily</Text>
      </View>

      <Card>
        {step === "phone" ? (
          <View style={{ gap: space.base }}>
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="muted">Mobile number</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{
                  paddingHorizontal: space.md, paddingVertical: 14,
                  borderRadius: radius.sm, backgroundColor: colors.mintSoft,
                }}>
                  <Text variant="bodyMed" tone="brand">+91</Text>
                </View>
                <TextInput
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                  style={[field, { flex: 1 }]}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.ink3}
                  keyboardType="number-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  editable={!busy}
                  maxLength={10}
                  returnKeyType="go"
                  onSubmitEditing={sendCode}
                />
              </View>
            </View>

            {error ? <ErrorNote text={error} /> : null}

            <Button label="Send code" onPress={sendCode} loading={busy} disabled={phone.length !== 10 || busy} fullWidth />
            <Text variant="caption" tone="subtle" center>
              We&apos;ll text you a 6-digit code. Standard rates apply.
            </Text>
          </View>
        ) : (
          <View style={{ gap: space.base }}>
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="muted">Enter the code</Text>
              <Text variant="small" tone="muted">Sent to +91 {phone}</Text>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                style={[field, { fontSize: 24, letterSpacing: 8, textAlign: "center", marginTop: space.sm }]}
                placeholder="••••••"
                placeholderTextColor={colors.ink3}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                editable={!busy}
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={submitCode}
              />
            </View>

            {error ? <ErrorNote text={error} /> : null}

            <Button label="Verify & continue" onPress={submitCode} loading={busy} disabled={code.length < 4 || busy} fullWidth />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pressable onPress={() => { setStep("phone"); setCode(""); setError(null); }} hitSlop={8}>
                <Text variant="small" tone="brand">Change number</Text>
              </Pressable>
              <Pressable onPress={cooldown > 0 || busy ? undefined : sendCode} hitSlop={8} disabled={cooldown > 0 || busy}>
                <Text variant="small" tone={cooldown > 0 ? "subtle" : "brand"}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Card>

      {appleAvailable && step === "phone" ? (
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Text variant="caption" tone="subtle" center>or</Text>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={{ height: 52, width: "100%" }}
            onPress={signInWithApple}
          />
        </View>
      ) : null}

      <Text variant="caption" tone="subtle" center style={{ marginTop: space.xl }}>
        By continuing you agree to DOODLY&apos;s Terms and Privacy Policy.
      </Text>
    </Screen>
  );
}

function ErrorNote({ text }: { text: string }) {
  const { radius, space } = useTheme();
  return (
    <View style={{ backgroundColor: "rgba(214,69,61,0.10)", borderRadius: radius.sm, padding: space.md }}>
      <Text variant="small" tone="danger">{text}</Text>
    </View>
  );
}
