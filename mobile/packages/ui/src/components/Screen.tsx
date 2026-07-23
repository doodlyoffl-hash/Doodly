/* =============================================================
   DOODLY mobile — Screen + Card.
   Screen is the root of every route: it owns the safe-area insets, the
   themed background and the keyboard behaviour, so no screen re-solves
   the notch/home-indicator problem.
   ============================================================= */
import React, { type ReactNode } from "react";
import {
  KeyboardAvoidingView, Platform, RefreshControl, ScrollView,
  View, type StyleProp, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. Off for screens that own a FlatList —
   *  nesting a list inside a ScrollView breaks virtualisation. */
  scroll?: boolean;
  /** Pull-to-refresh. Only meaningful with scroll. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Skip horizontal padding for edge-to-edge content (hero images, lists). */
  bleed?: boolean;
  /** Use the secondary ground instead of the default milk white. */
  alt?: boolean;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll, onRefresh, refreshing, bleed, alt, footer, style }: ScreenProps) {
  const { colors, space, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bg = alt ? colors.milk2 : colors.milk;

  const padding: ViewStyle = {
    paddingHorizontal: bleed ? 0 : space.base,
    paddingTop: insets.top + space.sm,
  };

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        padding,
        // Leave room past the home indicator so the last row is never
        // trapped under it.
        { paddingBottom: insets.bottom + space.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.leaf} colors={[colors.leaf]} />
          : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padding]}>{children}</View>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: bg }, style]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {body}
        {footer ? (
          <View style={{
            paddingHorizontal: space.base,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.md,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export interface CardProps {
  children: ReactNode;
  /** Lift the card off the page. Off for flat rows inside a list. */
  elevated?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, elevated = true, padded = true, style }: CardProps) {
  const { colors, radius, space, shadow } = useTheme();
  return (
    <View style={[
      {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: padded ? space.base : 0,
        borderWidth: 1,
        borderColor: colors.line,
      },
      elevated && shadow.sm,
      style,
    ]}>
      {children}
    </View>
  );
}
