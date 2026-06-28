/* =============================================================
   Auto Delivery Assignment — shared constants
   ============================================================= */

/** Maximum glass bottles a single executive can carry per trip. */
export const BOTTLE_CAPACITY = 45;

/** Reasons a delivery lands in the pending-assignment queue. */
export const QUEUE_REASON = {
  CAPACITY_FULL: "capacity_full",   // all executives reached capacity
  NO_EXECUTIVE: "no_executive",     // no available executive at all
  OVERSIZE: "oversize",             // single delivery > max capacity (never fits a trip)
  LOCKED_CAPACITY: "locked_capacity", // locked to an executive who has no room
} as const;

export type QueueReason = (typeof QUEUE_REASON)[keyof typeof QUEUE_REASON];

/** Executive availabilities that can receive new work. */
export const ASSIGNABLE_AVAILABILITY = ["AVAILABLE", "RETURNED_TO_DAIRY"] as const;
