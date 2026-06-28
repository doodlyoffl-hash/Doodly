/* =============================================================
   Bulk Milk Requests — pure constants, labels & status workflow.
   No DB / no server-only imports → safe for client + tests.
   ============================================================= */

export const BULK_STATUSES = [
  "NEW", "CONTACTED", "QUOTATION_SENT", "CONFIRMED", "SCHEDULED", "DELIVERED", "CANCELLED",
] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

export const STATUS_LABEL: Record<BulkStatus, string> = {
  NEW: "New request",
  CONTACTED: "Contacted",
  QUOTATION_SENT: "Quotation sent",
  CONFIRMED: "Confirmed",
  SCHEDULED: "Scheduled",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/* Linear happy-path: NEW → CONTACTED → QUOTATION_SENT → CONFIRMED → SCHEDULED → DELIVERED.
   CANCELLED is reachable from any non-terminal state. DELIVERED/CANCELLED are terminal. */
const NEXT: Record<BulkStatus, BulkStatus[]> = {
  NEW: ["CONTACTED", "CANCELLED"],
  CONTACTED: ["QUOTATION_SENT", "CANCELLED"],
  QUOTATION_SENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const isTerminal = (s: BulkStatus) => NEXT[s].length === 0;
export const allowedNext = (s: BulkStatus): BulkStatus[] => NEXT[s];
export const canTransition = (from: BulkStatus, to: BulkStatus): boolean => NEXT[from].includes(to);

export const EVENT_TYPES = [
  "WEDDING", "HOUSEWARMING", "BIRTHDAY", "RELIGIOUS", "CATERING",
  "HOTEL", "RESTAURANT", "CORPORATE", "FESTIVAL", "OTHER",
] as const;
export type BulkEventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<BulkEventType, string> = {
  WEDDING: "Wedding",
  HOUSEWARMING: "Housewarming",
  BIRTHDAY: "Birthday",
  RELIGIOUS: "Religious function",
  CATERING: "Catering",
  HOTEL: "Hotel",
  RESTAURANT: "Restaurant",
  CORPORATE: "Corporate event",
  FESTIVAL: "Festival",
  OTHER: "Other",
};

export const QTY_UNITS = ["LITRES", "BOTTLES"] as const;
export type BulkQtyUnit = (typeof QTY_UNITS)[number];
export const UNIT_LABEL: Record<BulkQtyUnit, string> = { LITRES: "Litres", BOTTLES: "Glass bottles" };

export const CONTACT_METHODS = ["PHONE", "WHATSAPP", "EMAIL"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_LABEL: Record<ContactMethod, string> = { PHONE: "Phone call", WHATSAPP: "WhatsApp", EMAIL: "Email" };

/** Human-friendly, collision-resistant Request ID, e.g. "BULK-7K3M2A".
   Crockford-ish base32 (no I/O/0/1) so it's easy to read out over the phone. */
export function generateRequestCode(rand: () => number = Math.random): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return `BULK-${code}`;
}
