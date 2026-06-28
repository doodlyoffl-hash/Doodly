/* =============================================================
   Bulk Milk Requests — shared Zod validation (client + server + tests).
   Pure module: no DB, no server-only. The same schema validates the
   form inline AND the API payload, so rules never drift.
   ============================================================= */
import { z } from "zod";
import { EVENT_TYPES, QTY_UNITS, CONTACT_METHODS } from "./workflow";

const INDIAN_MOBILE = /^(?:\+?91[-\s]?)?[6-9]\d{9}$/;
const PINCODE = /^[1-9]\d{5}$/;

const notInPast = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime();
};

export const BulkRequestSchema = z.object({
  // Customer details
  fullName: z.string().trim().min(2, "Please enter your full name").max(80),
  mobile: z.string().trim().regex(INDIAN_MOBILE, "Enter a valid 10-digit mobile number"),
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),

  // Event details
  eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: "Select an event type" }) }),
  eventDate: z.string().min(1, "Select an event date").refine(notInPast, "Event date cannot be in the past"),
  deliveryTime: z.string().trim().min(1, "Enter a delivery time"),
  deliveryAddress: z.string().trim().min(5, "Enter the delivery address"),
  city: z.string().trim().min(2, "Enter the city"),
  pincode: z.string().trim().regex(PINCODE, "Enter a valid 6-digit pincode"),

  // Order details
  quantity: z.coerce.number({ invalid_type_error: "Enter a quantity" }).int("Use a whole number").positive("Quantity must be greater than zero"),
  unit: z.enum(QTY_UNITS),
  additionalRequirements: z.string().trim().max(500).optional().or(z.literal("")),

  // Contact + notes
  preferredContact: z.enum(CONTACT_METHODS),
  specialInstructions: z.string().trim().max(1000).optional().or(z.literal("")),

  // Spam honeypot — accepted by the schema, but the API/service silently drop
  // any submission where it is filled (so bots get a normal-looking success).
  company: z.string().optional(),
});

export type BulkRequestInput = z.infer<typeof BulkRequestSchema>;

/** Normalise optional empty strings to undefined after a successful parse. */
export function normalizeBulkRequest(input: BulkRequestInput) {
  const clean = <T extends string | undefined>(v: T) => (v ? v : undefined);
  return {
    ...input,
    email: clean(input.email),
    additionalRequirements: clean(input.additionalRequirements),
    specialInstructions: clean(input.specialInstructions),
    mobile: input.mobile.replace(/[\s-]/g, ""),
  };
}
