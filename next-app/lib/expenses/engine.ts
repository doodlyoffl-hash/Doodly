/* =============================================================
   Daily Expense Management — PURE engine (no DB, no I/O). Tested.
   ID formatting, GST/total maths, status workflow, payment-status
   derivation, default categories, and date-range presets.
   ============================================================= */

// ---------- payment modes ----------

export const EXPENSE_PAYMENT_MODES = [
  "CASH", "UPI", "BANK_TRANSFER", "CREDIT_CARD", "DEBIT_CARD", "CHEQUE", "WALLET", "OTHER",
] as const;
export type ExpensePaymentMode = (typeof EXPENSE_PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABEL: Record<ExpensePaymentMode, string> = {
  CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card", CHEQUE: "Cheque", WALLET: "Wallet", OTHER: "Other",
};

// ---------- status workflow ----------

export const EXPENSE_STATUSES = [
  "PENDING_APPROVAL", "APPROVED", "PAID", "PARTIALLY_PAID", "REJECTED", "CANCELLED",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING_APPROVAL: "Pending Approval", APPROVED: "Approved", PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

const NEXT: Record<ExpenseStatus, ExpenseStatus[]> = {
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAID", "PARTIALLY_PAID", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "CANCELLED"],
  PAID: [],
  REJECTED: [],
  CANCELLED: [],
};
export const allowedNextExpenseStatus = (s: ExpenseStatus): ExpenseStatus[] => NEXT[s];
export const canTransitionExpenseStatus = (from: ExpenseStatus, to: ExpenseStatus): boolean => NEXT[from].includes(to);
export const isTerminalExpenseStatus = (s: ExpenseStatus): boolean => NEXT[s].length === 0;

// ---------- identifiers ----------

/** "EXP-20260701-0001" — per-day sequence, never reused. `ymd` is YYYYMMDD. */
export function formatExpenseCode(ymd: string, seq: number): string {
  return `EXP-${ymd}-${String(seq).padStart(4, "0")}`;
}

/** Date → "YYYYMMDD" (UTC-safe from an ISO date string or Date). */
export function toYmd(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ---------- money ----------

export interface ExpenseAmountInput { amountPaise: number; gstIncluded: boolean; gstPaise?: number; }
export interface ExpenseTotals { amountPaise: number; gstPaise: number; totalPaise: number; }

/**
 * Compute the grand total. When GST is *included* in the amount, the total is
 * just the amount (gst is informational). When it is *not* included, GST is
 * added on top. All integer paise.
 */
export function computeExpenseTotal({ amountPaise, gstIncluded, gstPaise = 0 }: ExpenseAmountInput): ExpenseTotals {
  const gst = Math.max(0, Math.round(gstPaise));
  const amt = Math.max(0, Math.round(amountPaise));
  return { amountPaise: amt, gstPaise: gst, totalPaise: gstIncluded ? amt : amt + gst };
}

/** Derive a payment status from amounts. Respects an explicit non-payment status. */
export function deriveExpensePaymentStatus(totalPaise: number, paidPaise: number): "PAID" | "PARTIALLY_PAID" | "APPROVED" {
  if (totalPaise > 0 && paidPaise >= totalPaise) return "PAID";
  if (paidPaise > 0) return "PARTIALLY_PAID";
  return "APPROVED";
}

// ---------- default categories (seed; editable in Admin Settings) ----------

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Milk Procurement", "Farmer Payment", "Transportation", "Fuel", "Vehicle Maintenance",
  "Staff Salary", "Delivery Expenses", "Office Rent", "Electricity Bill", "Water Bill",
  "Internet & Mobile", "Packaging Materials", "Glass Bottle Purchase", "Bottle Replacement",
  "Cleaning & Sanitation", "Equipment Maintenance", "Marketing & Advertising",
  "Printing & Stationery", "Software & Subscriptions", "Bank Charges", "Miscellaneous",
] as const;

export function slugifyCategory(name: string): string {
  return name.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------- date-range presets (for filters) ----------

export type DatePreset =
  | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "all";

/** Resolve a preset to an inclusive [from,to] in YYYY-MM-DD, relative to `now`. */
export function resolveDatePreset(preset: DatePreset, now = new Date()): { from?: string; to?: string } {
  const iso = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today": return { from: iso(start), to: iso(start) };
    case "yesterday": { const y = new Date(start); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case "last7": { const f = new Date(start); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(start) }; }
    case "last30": { const f = new Date(start); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(start) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "lastMonth": { const f = new Date(now.getFullYear(), now.getMonth() - 1, 1); const t = new Date(now.getFullYear(), now.getMonth(), 0); return { from: iso(f), to: iso(t) }; }
    default: return {};
  }
}
