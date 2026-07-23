/* =============================================================
   DOODLY mobile — Badge (status pill).
   State must be readable at a glance, so it is encoded in COLOUR + TEXT,
   never colour alone (colour-blind users, and glare on a delivery
   executive's phone at 6am in the sun).

   statusIntent() maps the backend's real status strings to an intent, so
   a status renders identically in both apps without either one keeping
   its own copy of the mapping.
   ============================================================= */
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export type BadgeIntent = "neutral" | "info" | "pending" | "success" | "danger" | "brand";

export interface BadgeProps {
  label: string;
  intent?: BadgeIntent;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, intent = "neutral", style }: BadgeProps) {
  const { colors, semantic, radius, space } = useTheme();

  // Soft ground + saturated text: legible in both themes without a border.
  const map: Record<BadgeIntent, { bg: string; fg: string }> = {
    neutral: { bg: colors.milk2, fg: colors.ink2 },
    info: { bg: colors.mintSoft, fg: semantic.info },
    pending: { bg: colors.goldSoft, fg: "#8A6A1F" },
    success: { bg: colors.mintSoft, fg: semantic.success },
    danger: { bg: "rgba(214,69,61,0.12)", fg: semantic.danger },
    brand: { bg: colors.mintSoft, fg: colors.leaf600 },
  };
  const { bg, fg } = map[intent];

  return (
    <View style={[{
      backgroundColor: bg,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 5,
      alignSelf: "flex-start",
    }, style]}>
      <Text variant="label" style={{ color: fg }}>{label}</Text>
    </View>
  );
}

/** Backend status string → intent. Covers Order, Delivery and Payment
 *  statuses (see next-app/prisma/schema.prisma). Unknown values fall back
 *  to neutral rather than throwing — a new server status must never crash
 *  a shipped app that predates it. */
export function statusIntent(status: string): BadgeIntent {
  const s = String(status || "").toUpperCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "DELIVERED":
    case "PAID":
    case "COMPLETED":
    case "ACTIVE":
    case "SUCCESS":
      return "success";
    case "FAILED":
    case "CANCELLED":
    case "REFUNDED":
    case "SUSPENDED":
    case "MISSED":
      return "danger";
    case "PENDING":
    case "AWAITING_PAYMENT":
    case "PAUSED":
    case "SKIPPED":
      return "pending";
    case "OUT_FOR_DELIVERY":
    case "ON_THE_WAY":
    case "ONWAY":
    case "REACHED":
    case "SHIPPED":
      return "info";
    case "CONFIRMED":
    case "ACCEPTED":
    case "ASSIGNED":
    case "PACKED":
    case "SCHEDULED":
      return "brand";
    default:
      return "neutral";
  }
}

/** Human label for a backend status — "OUT_FOR_DELIVERY" reads badly on a
 *  card. Falls back to title-casing anything unrecognised. */
export function statusLabel(status: string): string {
  const s = String(status || "").toUpperCase().replace(/[\s-]+/g, "_");
  const named: Record<string, string> = {
    OUT_FOR_DELIVERY: "Out for delivery",
    ON_THE_WAY: "On the way",
    ONWAY: "On the way",
    AWAITING_PAYMENT: "Awaiting payment",
    REACHED: "Reached",
    PACKED: "Packed",
    ASSIGNED: "Assigned",
    ACCEPTED: "Accepted",
    DELIVERED: "Delivered",
    FAILED: "Failed",
    SKIPPED: "Skipped",
  };
  const hit = named[s];
  if (hit) return hit;
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}
