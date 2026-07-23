/* =============================================================
   DOODLY Customer — app root.
   Holds the splash until fonts AND the restored session are settled, so
   the app never flashes an unstyled frame or a wrongly-signed-out one.
   ============================================================= */
import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import {
  HankenGrotesk_400Regular, HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { ThemeProvider } from "@doodly/ui";
import { AuthProvider, useAuth, useAppServices, resolveDeepLink, CUSTOMER_ROLES, type PushRoute } from "@doodly/core";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const openRoute = (route: PushRoute) =>
    router.push(route.params ? { pathname: route.path as never, params: route.params } : (route.path as never));

  // Push registration, analytics identity, and notification-tap routing —
  // all bound to the session by this one hook (see @doodly/core).
  useAppServices({ app: "customer", onOpenRoute: openRoute });

  // Universal / custom-scheme links (https://doodly.in/order/123, doodly://…).
  // A referral code on the URL is stashed for the login screen to read.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const resolved = resolveDeepLink(url);
      if (!resolved) return;
      if (resolved.referralCode) AsyncStorage.setItem("doodly.pending.referral", resolved.referralCode).catch(() => {});
      // Only navigate once signed in; the Gate sends signed-out users to login,
      // where the stashed referral is picked up.
      if (status === "authenticated") openRoute(resolved);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [status]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "login";

    if (status === "unauthenticated" && !inAuth) router.replace("/login");
    else if (status === "authenticated" && inAuth) router.replace("/");

    SplashScreen.hideAsync().catch(() => {});
  }, [status, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold, Fraunces_700Bold,
    HankenGrotesk_400Regular, HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
  });

  // A failed font load must not brick the app — RN falls back to the system
  // face. Only block while genuinely still loading.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider allowedRoles={CUSTOMER_ROLES} appLabel="the DOODLY app">
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
