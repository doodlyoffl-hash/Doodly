/* =============================================================
   B2B Order Management — PURE engine (no DB, no I/O). Fully tested.
   Sequential ID formatting, order pricing, and status workflow.
   ============================================================= */

export const BUSINESS_TYPES = [
  "HOTEL", "RESTAURANT", "CAFE", "BAKERY", "SWEET_SHOP", "TEA_STALL",
  "CATERING", "HOSTEL", "HOSPITAL", "CORPORATE", "OTHER",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  HOTEL: "Hotel", RESTAURANT: "Restaurant", CAFE: "Café", BAKERY: "Bakery",
  SWEET_SHOP: "Sweet Shop", TEA_STALL: "Tea Stall", CATERING: "Catering",
  HOSTEL: "Hostel", HOSPITAL: "Hospital", CORPORATE: "Corporate Office", OTHER: "Other",
};

export const PAYMENT_TERMS = ["CASH", "CREDIT", "WEEKLY", "MONTHLY", "ADVANCE"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];
export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = {
  CASH: "Cash", CREDIT: "Credit", WEEKLY: "Weekly billing", MONTHLY: "Monthly billing", ADVANCE: "Advance payment",
};

/** Units offered per product slug (B2B supports product-specific units). */
export const PRODUCT_UNITS: Record<string, string[]> = {
  milk: ["Litres", "Bottles"],
  curd: ["KG", "Litres", "Tubs"],
  paneer: ["KG", "Packs"],
  kova: ["KG", "Packs"],
  ghee: ["KG", "Litres", "Tins"],
};
export const ALL_UNITS = ["Litres", "KG", "Bottles", "Packs", "Tubs", "Tins"] as const;

// ---------- sequential identifiers ----------

/** "DOO-B2B-000001" — sequential, never reused. */
export function formatBusinessCode(seq: number): string {
  return `DOO-B2B-${String(seq).padStart(6, "0")}`;
}

/** "B2B-ORD-2026-000125" — year + sequence. */
export function formatOrderCode(year: number, seq: number): string {
  return `B2B-ORD-${year}-${String(seq).padStart(6, "0")}`;
}

/** "DOODLY/B2B/2026/00001" — invoice number. */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `DOODLY/B2B/${year}/${String(seq).padStart(5, "0")}`;
}

// ---------- pricing ----------

export interface OrderLineInput { unitPricePaise: number; quantity: number; }
export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * Compute order totals from line items. discountBps/taxBps in basis points
 * (500 = 5%). Tax applies to the post-discount subtotal. All paise integers.
 */
export function computeOrderTotals(
  lines: OrderLineInput[], opts: { discountBps?: number; taxBps?: number } = {},
): OrderTotals {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.unitPricePaise * l.quantity), 0);
  const discount = Math.round((subtotal * (opts.discountBps ?? 0)) / 10000);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * (opts.taxBps ?? 0)) / 10000);
  return { subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, totalPaise: taxable + tax };
}

export function lineTotalPaise(unitPricePaise: number, quantity: number): number {
  return Math.round(unitPricePaise * quantity);
}

// ---------- order status workflow ----------

export const B2B_STATUSES = [
  "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED",
] as const;
export type B2BOrderStatus = (typeof B2B_STATUSES)[number];
export const B2B_STATUS_LABEL: Record<B2BOrderStatus, string> = {
  PENDING: "Pending", CONFIRMED: "Confirmed", PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", COMPLETED: "Completed", CANCELLED: "Cancelled",
};

const NEXT: Record<B2BOrderStatus, B2BOrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};
export const allowedNextStatus = (s: B2BOrderStatus): B2BOrderStatus[] => NEXT[s];
export const canTransitionStatus = (from: B2BOrderStatus, to: B2BOrderStatus): boolean => NEXT[from].includes(to);
export const isTerminalStatus = (s: B2BOrderStatus): boolean => NEXT[s].length === 0;

// ---------- payment status derivation ----------

export type B2BPaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "CREDIT";

/** Derive payment status from amounts + terms. CREDIT terms read as CREDIT until paid. */
export function derivePaymentStatus(totalPaise: number, paidPaise: number, term: PaymentTerm): B2BPaymentStatus {
  if (paidPaise >= totalPaise && totalPaise > 0) return "PAID";
  if (paidPaise > 0) return "PARTIAL";
  if (term === "CREDIT" || term === "WEEKLY" || term === "MONTHLY") return "CREDIT";
  return "PENDING";
}
