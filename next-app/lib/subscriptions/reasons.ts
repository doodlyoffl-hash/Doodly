/* Predefined reasons for a skipped / missed / adjusted delivery.
   Stored verbatim in Delivery.adjustReason; shown (via the labels) in the
   admin drawer, the customer timeline and the lifecycle reports. */
export const ADJUST_REASONS = [
  "OPS_MISSED", "EXECUTIVE_ISSUE", "VEHICLE_BREAKDOWN", "WEATHER", "STOCK_UNAVAILABLE",
  "CUSTOMER_REQUESTED", "QUALITY_ISSUE", "ADMIN_ADJUSTMENT", "OTHER",
] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export const ADJUST_REASON_LABELS: Record<AdjustReason, string> = {
  OPS_MISSED: "Operations missed delivery",
  EXECUTIVE_ISSUE: "Delivery executive issue",
  VEHICLE_BREAKDOWN: "Vehicle breakdown",
  WEATHER: "Weather",
  STOCK_UNAVAILABLE: "Stock unavailable",
  CUSTOMER_REQUESTED: "Customer requested",
  QUALITY_ISSUE: "Quality issue",
  ADMIN_ADJUSTMENT: "Admin adjustment",
  OTHER: "Other",
};

/** Reasons that represent OUR operational failure (drive the ops-alert + apology). */
export const OPS_FAULT_REASONS: readonly AdjustReason[] = ["OPS_MISSED", "EXECUTIVE_ISSUE", "VEHICLE_BREAKDOWN", "WEATHER", "STOCK_UNAVAILABLE", "QUALITY_ISSUE"];

export const reasonLabel = (r?: string | null) => (r && r in ADJUST_REASON_LABELS ? ADJUST_REASON_LABELS[r as AdjustReason] : (r ?? ""));
