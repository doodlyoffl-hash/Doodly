/* Client-safe Expense types (no server imports). Dates serialize to ISO
   strings over the API; money is always integer paise. */
import type { ExpensePaymentMode, ExpenseStatus } from "./engine";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
}

export interface StaffRow { id: string; name: string | null; role: string }

export interface AttachmentRow {
  id: string;
  name: string;
  kind: string;
  url: string | null;
  mime: string | null;
  sizeBytes: number;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  amountPaise: number;
  mode: ExpensePaymentMode;
  reference: string | null;
  note: string | null;
  paidBy: string | null;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  action: string;
  detail: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ExpenseRow {
  id: string;
  code: string;
  date: string;
  title: string;
  category: { name: string };
  vendor: string | null;
  invoiceNo: string | null;
  paymentMode: ExpensePaymentMode;
  amountPaise: number;
  gstIncluded: boolean;
  gstPaise: number;
  totalPaise: number;
  paidPaise: number;
  status: ExpenseStatus;
  requestedBy: string | null;
  approvedBy: string | null;
  paidBy: string | null;
  notes: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  _count?: { attachments: number };
}

export interface ExpenseDetail extends Omit<ExpenseRow, "category" | "_count"> {
  categoryId: string;
  category: CategoryRow;
  description: string | null;
  attachments: AttachmentRow[];
  payments: PaymentRow[];
  auditLogs: AuditRow[];
}

export interface DashboardResponse {
  cards: {
    todayPaise: number; todayCount: number;
    weekPaise: number;
    monthPaise: number; monthCount: number;
    pendingApprovals: number;
    paidPaise: number;
    outstandingPaise: number;
  };
  categoryBreakdown: { name: string; totalPaise: number }[];
  paymentModeBreakdown: { mode: string; totalPaise: number }[];
  dailyTrend: { date: string; totalPaise: number }[];
  monthlyTrend: { month: string; totalPaise: number }[];
}

export interface ReportsResponse {
  totals: { count: number; totalPaise: number; paidPaise: number; outstandingPaise: number; gstPaise: number };
  byCategory: { name: string; count: number; totalPaise: number }[];
  byPaymentMode: { mode: string; count: number; totalPaise: number }[];
  byVendor: { vendor: string; count: number; totalPaise: number }[];
  outstanding: { id: string; code: string; title: string; vendor: string | null; totalPaise: number; paidPaise: number; date: string; outstandingPaise: number }[];
  gst: { count: number; gstPaise: number; totalPaise: number };
}
