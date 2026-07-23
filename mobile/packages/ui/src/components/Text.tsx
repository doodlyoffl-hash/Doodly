/* =============================================================
   DOODLY mobile — Text.
   The ONLY way text is rendered. Variants come from the shared type
   scale, so a screen can't invent a 17px heading and drift the design.

   `tone` selects a semantic ink colour rather than a raw hex, which is
   what keeps dark mode readable without per-screen overrides.
   ============================================================= */
import React from "react";
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "../theme";
import { type as typeScale } from "../tokens";

export type TextVariant = keyof typeof typeScale;
export type TextTone = "default" | "muted" | "subtle" | "brand" | "onBrand" | "success" | "warning" | "danger" | "gold";

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Centre a single line/paragraph without a wrapper View. */
  center?: boolean;
  children?: React.ReactNode;
}

export function Text({ variant = "body", tone = "default", center, style, children, ...rest }: TextProps) {
  const { colors, semantic } = useTheme();

  const toneColor: Record<TextTone, string> = {
    default: colors.ink,
    muted: colors.ink2,
    subtle: colors.ink3,
    brand: colors.leaf,
    // On a forest/leaf-filled surface the ink colours vanish — this is the
    // deliberate light-on-dark pairing for buttons and hero cards.
    onBrand: "#FFFFFF",
    success: semantic.success,
    warning: semantic.warning,
    danger: semantic.danger,
    gold: colors.gold,
  };

  const base = typeScale[variant] as TextStyle;

  return (
    <RNText
      style={[base, { color: toneColor[tone] }, center && { textAlign: "center" }, style]}
      // Respect the OS font-size setting, but cap the multiplier so a very
      // large accessibility setting can't shatter row/card layouts.
      maxFontSizeMultiplier={1.4}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Money, formatted from PAISE — the unit every DOODLY API speaks.
 *  Never pass rupees to this; that bug is silent and expensive. */
export function Money({
  paise, variant = "numeric", tone = "default", style, ...rest
}: { paise: number } & Omit<TextProps, "children">) {
  const rupees = Math.round(Number(paise) || 0) / 100;
  const text = "₹" + rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return <Text variant={variant} tone={tone} style={style} {...rest}>{text}</Text>;
}
