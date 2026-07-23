/* =============================================================
   DOODLY mobile — theme provider.
   Resolves the active colour scheme and hands screens a typed `colors`
   object. Screens must read colours from useTheme() and never import a
   hex directly, so dark mode stays correct without per-screen work.

   Default is "system": DOODLY's identity is a bright, milky light theme,
   but a dairy app gets opened at 5am — respecting the OS setting matters
   more than forcing our preferred look.
   ============================================================= */
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette, semantic, radius, space, type, shadow, type ColorScheme, type Colors } from "./tokens";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeValue {
  scheme: ColorScheme;
  colors: Colors;
  semantic: typeof semantic;
  radius: typeof radius;
  space: typeof space;
  type: typeof type;
  shadow: typeof shadow;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  isDark: boolean;
}

const PREF_KEY = "doodly.theme.preference";

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Restore the saved preference. Until it loads we follow the OS, which
  // is the least jarring default — no flash of the wrong theme.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREF_KEY)
      .then((v) => { if (alive && (v === "light" || v === "dark" || v === "system")) setPreferenceState(v); })
      .catch(() => { /* preference only — fall back to system */ });
    return () => { alive = false; };
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
  };

  const scheme: ColorScheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeValue>(() => ({
    scheme,
    colors: palette[scheme],
    semantic, radius, space, type, shadow,
    preference,
    setPreference,
    isDark: scheme === "dark",
  }), [scheme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>. Wrap the app root.");
  return ctx;
}
