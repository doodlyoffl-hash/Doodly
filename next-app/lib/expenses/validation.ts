/* =============================================================
   Daily Expense Management — shared Zod validation (API + UI).
   ============================================================= */
import { z } from "zod";
import { EXPENSE_PAYMENT_MODES } from "./engine";

const optStr = (max = 200) => z.string().trim().max(max).optional().or(z.literal(""));

export const AttachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["invoice", "receipt", "bill", "screenshot", "pdf", "image", "other"]).default("other"),
  url: z.string().trim().max(2000).optional().or(z.literal("")),
  mime: optStr(120),
  sizeBytes: z.coerce.number().int().nonnegative().default(0),
});

export const ExpenseSchema = z.object({
  date: z.string().min(1, "Select the expense date"),
  title: z.string().trim().min(2, "Enter an expense title").max(160),
  categoryId: z.string().min(1, "Select a category"),
  description: optStr(1000),
  vendor: optStr(160),
  invoiceNo: optStr(80),
  paymentMode: z.enum(EXPENSE_PAYMENT_MODES).default("CASH"),
  amountPaise: z.coerce.number().int().positive("Amount must be greater than zero"),
  gstIncluded: z.coerce.boolean().default(false),
  gstPaise: z.coerce.number().int().nonnegative().default(0),
  requestedBy: optStr(120),
  approvedBy: optStr(120),
  paidBy: optStr(120),
  notes: optStr(1000),
  attachments: z.array(AttachmentSchema).max(20).optional(),
});
export type ExpenseInput = z.infer<typeof ExpenseSchema>;

export const CategorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name").max(80),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type CategoryInput = z.infer<typeof CategorySchema>;

export const PaymentSchema = z.object({
  amountPaise: z.coerce.number().int().positive("Amount must be greater than zero"),
  mode: z.enum(EXPENSE_PAYMENT_MODES).default("CASH"),
  reference: optStr(120),
  note: optStr(300),
  paidBy: optStr(120),
});
export type PaymentInput = z.infer<typeof PaymentSchema>;
