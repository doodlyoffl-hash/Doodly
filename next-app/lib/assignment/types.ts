/* =============================================================
   Auto Delivery Assignment — domain types for the pure engine.
   These are DB-agnostic: the service layer maps Prisma rows to/from
   these shapes, so the engine stays testable without a database.
   ============================================================= */
import type { QueueReason } from "./constants";

export interface GeoPoint {
  lat?: number | null;
  lng?: number | null;
}

/** A single customer delivery to be assigned. */
export interface DeliveryInput extends GeoPoint {
  id: string;
  bottles: number;
  area?: string | null;      // locality / neighbourhood (primary grouping key)
  zoneId?: string | null;    // route/zone id (secondary grouping key)
  /** Locked to a specific executive by an admin — never auto-moved elsewhere. */
  lockedTo?: string | null;
  /** Higher = assigned sooner from the queue (FIFO tiebreak by insertion order). */
  priority?: number;
}

/** An executive available to carry deliveries. */
export interface ExecutiveInput extends GeoPoint {
  id: string;
  /** Max bottles this executive can carry per trip (default 45). */
  capacity: number;
  /** Bottles already loaded on the current trip (return-trip partial fills). */
  used?: number;
  area?: string | null;
  zoneId?: string | null;
  /** True only when status is AVAILABLE or RETURNED_TO_DAIRY. */
  available: boolean;
}

/** Result: one executive's planned trip load (delivery ids in stop order). */
export interface ExecutiveAssignment {
  executiveId: string;
  deliveryIds: string[];
  bottles: number;
  stops: number;
}

/** A delivery that could not be assigned this round. */
export interface QueuedDelivery {
  deliveryId: string;
  bottles: number;
  reason: QueueReason;
  area?: string | null;
  zoneId?: string | null;
  priority: number;
}

export interface AssignmentStats {
  totalDeliveries: number;
  totalBottles: number;
  assignedDeliveries: number;
  assignedBottles: number;
  queuedDeliveries: number;
  queuedBottles: number;
  executivesUsed: number;
}

export interface AssignmentPlan {
  assignments: ExecutiveAssignment[];
  queue: QueuedDelivery[];
  stats: AssignmentStats;
}

export interface PlanOptions {
  /** Fallback capacity when an executive has none set. Default BOTTLE_CAPACITY. */
  defaultCapacity?: number;
  /** Prefer assigning a delivery to an executive whose zone/area matches. Default true. */
  zoneAffinity?: boolean;
  /** Optimise stop order within each trip via nearest-neighbour. Default true. */
  optimizeRoute?: boolean;
}
