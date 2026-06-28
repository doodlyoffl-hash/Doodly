/* =============================================================
   B2B Order Management — shared Zod validation (API + UI + tests).
   ============================================================= */
import { z } from "zod";
import { BUSINESS_TYPES, PAYMENT_TERMS } from "./engine";

const INDIAN_MOBILE = /^(?:\+?91[-\s]?)?[6-9]\d{9}$/;
const PINCODE = /^[1-9]\d{5}$/;
const optStr = z.string().trim().max(200).optional().or(z.literal(""));

export const BusinessSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(120),
  type: z.enum(BUSINESS_TYPES),
  contactPerson: z.string().trim().min(2, "Enter a contact person"),
  mobile: z.string().trim().regex(INDIAN_MOBILE, "Enter a valid 10-digit mobile number"),
  altMobile: z.string().trim().regex(INDIAN_MOBILE, "Enter a valid number").optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  line1: z.string().trim().min(4, "Enter the business address"),
  landmark: optStr,
  area: optStr,
  city: z.string().trim().min(2).default("Vijayawada"),
  state: z.string().trim().min(2).default("Andhra Pradesh"),
  pincode: z.string().trim().regex(PINCODE, "Enter a valid 6-digit pincode"),
  lat: z.number().optional(),
  lng: z.number().optional(),
  gst: z.string().trim().max(20).optional().or(z.literal("")),
  pan: z.string().trim().max(12).optional().or(z.literal("")),
  billingAddress: z.string().trim().max(300).optional().or(z.literal("")),
  paymentTerm: z.enum(PAYMENT_TERMS).default("CASH"),
  discountBps: z.coerce.number().int().min(0).max(10000).default(0),
  creditLimitPaise: z.coerce.number().int().min(0).default(0),
  preferredTime: optStr,
  deliveryNotes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type BusinessInput = z.infer<typeof BusinessSchema>;

export const OrderItemSchema = z.object({
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unit: z.string().min(1),
  unitPricePaise: z.coerce.number().int().nonnegative(),
});

export const OrderSchema = z.object({
  businessId: z.string().min(1, "Select a business"),
  deliveryDate: z.string().min(1, "Select a delivery date"),
  deliveryTime: z.string().trim().min(1, "Enter a delivery time"),
  deliveryNotes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(OrderItemSchema).min(1, "Add at least one product"),
  discountBps: z.coerce.number().int().min(0).max(10000).optional(),
  taxBps: z.coerce.number().int().min(0).max(10000).optional(),
  remarks: z.string().trim().max(500).optional().or(z.literal("")),
});
export type OrderInput = z.infer<typeof OrderSchema>;
