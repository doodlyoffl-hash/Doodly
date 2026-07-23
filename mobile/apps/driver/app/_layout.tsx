/* =============================================================
   DOODLY Delivery — app root.
   Owns the three things that must exist before any screen renders:
   brand fonts, the theme, and the session. The splash screen is held
   until fonts AND the restored session are both settled, so the app
   never flashes an unstyled or wrongly-signed-out frame.
   ============================================================= */
import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import {
  HankenGrotesk_400Regular, HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { ThemeProvider } from "@doodly/ui";
import { AuthProvider, useAuth, useAppServices, DRIVER_ROLES, type PushRoute } from "@doodly/core";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Routes between the auth screens and the app based on session status.
 *  Kept as a child of AuthProvider so it can read the session. */
function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // New-assignment / route-change pushes route the executive straight to the
  // relevant screen; also binds analytics identity to the session.
  useAppServices({
    app: "driver",
    onOpenRoute: (route: PushRoute) =>
      router.push(route.params ? { pathname: route.path as never, params: route.params } : (route.path as never)),
  });

  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "login";

    if (status === "unauthenticated" && !inAuthGroup) router.replace("/login");
    else if (status === "authenticated" && inAuthGroup) router.replace("/");

    SplashScreen.hideAsync().catch(() => {});
  }, [status, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="index" />
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

  // A font that fails to load must not brick the app — RN falls back to the
  // system face, which is ugly but usable. Never block on fontError.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider allowedRoles={DRIVER_ROLES} appLabel="the DOODLY Delivery app">
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
