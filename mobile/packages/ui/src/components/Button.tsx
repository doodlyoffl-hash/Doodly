/* =============================================================
   DOODLY mobile — Button.
   Every tappable action. Enforces the 44pt minimum touch target both
   stores' accessibility guidance requires, and owns its own loading
   state so callers can't leave a button tappable during a network call
   (the classic double-order bug).
   ============================================================= */
import React from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { MIN_TAP } from "../tokens";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label — an icon element. */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({
  label, onPress, variant = "primary", size = "md",
  disabled, loading, fullWidth, icon, style, accessibilityHint,
}: ButtonProps) {
  const { colors, radius, space, semantic } = useTheme();
  const inactive = disabled || loading;

  const heights: Record<ButtonSize, number> = { sm: MIN_TAP, md: 52, lg: 58 };
  const pads: Record<ButtonSize, number> = { sm: space.base, md: space.lg, lg: space.lg };

  const surfaces: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.leaf },
    secondary: { backgroundColor: colors.mintSoft, borderWidth: 1, borderColor: colors.line },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: semantic.danger },
  };
  const tones = {
    primary: "onBrand", secondary: "brand", ghost: "brand", danger: "onBrand",
  } as const;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: heights[size],
          paddingHorizontal: pads[size],
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space.sm,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        surfaces[variant],
        // Opacity is the press affordance rather than a colour shift, so it
        // reads the same in both themes.
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "primary" || variant === "danger" ? "#FFFFFF" : colors.leaf} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text variant="bodyMed" tone={tones[variant]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
