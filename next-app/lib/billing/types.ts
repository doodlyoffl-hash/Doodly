/* Shared response shapes for the Subscription Billing admin module. */

export type BillingPayStatusKey = "PENDING" | "PARTIAL" | "PAID" | "FAILED" | "REFUNDED";
export type BillingStatusKey = "DRAFT" | "ISSUED" | "RENEWED" | "CANCELLED";

export interface BillingListItem {
  id: string;
  code: string;                  // BILL-000001 (Billing ID)
  subscriptionShortId: string;   // last-8 of subscription id
  subscriptionId: string;
  customer: { id: string; name: string | null; phone: string | null };
  product: string;               // first product (summary)
  variant: string;
  planName: string;
  cycleLabel: string;
  cycleNumber: number;
  billingDate: string;
  renewalDate: string;
  billingAmountPaise: number;
  walletUsedPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  autoPay: boolean;
  paymentStatus: BillingPayStatusKey;
  billingStatus: BillingStatusKey;
  invoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingFacets {
  plans: { slug: string; name: string }[];
  products: { id: string; name: string }[];
}

export interface BillingListResponse {
  billings: BillingListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: BillingFacets;
}

export interface BillingStats {
  activeBillingCycles: number;   // ISSUED billings on ACTIVE subscriptions
  upcomingRenewals: number;      // renewalDate within next 7 days
  todaysRenewals: number;
  failedPayments: number;
  successfulPayments: number;
  autoPayRenewals: number;       // billings on auto-pay
  pendingCollectionsPaise: number;
  totalBillingRevenuePaise: number; // collected (amountPaid) across PAID/PARTIAL
  mrrPaise: number;
  invoicesIssued: number;
}

export interface BillingEventRow {
  id: string; type: string; summary: string; detail: unknown; byRole: string | null; createdAt: string;
}
export interface BillingAttemptRow {
  id: string; attemptNo: number; method: string; status: string; amountPaise: number; walletPaise: number;
  reference: string; gatewayRef: string | null; failureReason: string | null; createdAt: string;
}

export interface BillingDetail {
  id: string;
  code: string;
  subscriptionId: string;
  subscriptionShortId: string;
  cycleNumber: number;
  cycleLabel: string;
  billingDate: string;
  periodStart: string;
  periodEnd: string;
  renewalDate: string;
  planName: string;
  planSlug: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null; walletPaise: number };
  items: { productName: string; variantLabel: string; qty: number; unitPaise: number; lineTotalPaise: number }[];
  billingAmountPaise: number;
  discountPaise: number;
  gstBps: number;
  gstPaise: number;
  walletUsedPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  duePaise: number;
  autoPay: boolean;
  paymentStatus: BillingPayStatusKey;
  billingStatus: BillingStatusKey;
  attemptsCount: number;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  autopay: { status: string; nextRenewalAt: string | null; attempts: number } | null;
  trialCashback: { status: string; amountPaise: number } | null;
  walletTxns: { id: string; type: string; kind: string; amountPaise: number; description: string | null; createdAt: string }[];
  attempts: BillingAttemptRow[];
  renewals: { code: string; cycleNumber: number; billingDate: string; totalPaise: number; paymentStatus: string }[];
  events: BillingEventRow[];
  company: { name: string; gstin: string | null };
}

export interface BillingPreview {
  subscriptionId: string;
  subscriptionShortId: string;
  customer: { id: string; name: string | null; phone: string | null; walletPaise: number };
  planName: string;
  cycleNumber: number;          // the next cycle that would be billed
  periodStart: string;
  periodEnd: string;
  renewalDate: string;
  items: { productName: string; variantLabel: string; qty: number; unitPaise: number; lineTotalPaise: number }[];
  billingAmountPaise: number;
  discountPaise: number;
  gstBps: number;
  gstPaise: number;
  maxWalletPaise: number;       // wallet available to apply
  alreadyBilled: boolean;       // a billing for this cycle already exists
}

export interface BillingReports {
  billing: { totalBillings: number; grossPaise: number; discountPaise: number; gstPaise: number; netPaise: number; collectedPaise: number; outstandingPaise: number };
  byStatus: { status: string; count: number; totalPaise: number }[];
  renewals: { total: number; auto: number; manual: number };
  failed: { count: number; amountPaise: number; rows: { code: string; customer: string; amountPaise: number; reason: string; date: string }[] };
  autopay: { on: number; off: number };
  wallet: { usedPaise: number; cashbackPaise: number };
  gst: { collectedPaise: number; byRate: { rateBps: number; gstPaise: number; count: number }[] };
  rows: { code: string; subscription: string; customer: string; phone: string; plan: string; billingDate: string; renewalDate: string; grossRupees: number; discountRupees: number; gstRupees: number; walletRupees: number; totalRupees: number; paymentStatus: string; billingStatus: string; autoPay: string; invoice: string }[];
}

export interface BillingConfigShape {
  gstBps: number;
  autopayRetryLimit: number;
  autopayRetryIntervalHours: number;
  invoicePrefix: string;
  companyName: string;
  gstin: string | null;
  canEdit: boolean;
}
