/* Shared response shapes for the admin Subscriptions module (client + server). */

export type SubStatusKey = "ACTIVE" | "PAUSED" | "VACATION" | "CANCELLED" | "COMPLETED";

export interface SubListItem {
  id: string;
  shortId: string;                 // last 8 chars, uppercased — the "Subscription ID"
  status: SubStatusKey;
  expired: boolean;                // status COMPLETED, or endDate in the past
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  plan: { name: string; slug: string; days: number };
  items: { qty: number; product: string; variant: string }[];
  productNames: string[];
  perDeliveryPaise: number;
  planTotalPaise: number;          // quoted plan value (after discount)
  startDate: string;
  endDate: string | null;
  nextDeliveryAt: string | null;
  deliverySlot: string;
  autoRenew: boolean;
  autopayStatus: string | null;    // AutopaySubscription.status, when set up
  walletPaise: number;             // customer's current wallet balance
  zone: { id: string; name: string } | null;
  executive: string | null;        // delivery-zone executive
  paymentStatus: "AUTOPAY" | "MANUAL";
  updatedAt: string;
}

export interface SubFacets {
  plans: { slug: string; name: string }[];
  products: { id: string; name: string }[];
  zones: { id: string; name: string }[];
}

export interface SubListResponse {
  subscriptions: SubListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: SubFacets;
}

export interface SubStats {
  total: number;
  active: number;
  paused: number;          // PAUSED + VACATION
  cancelled: number;
  expired: number;         // COMPLETED or past endDate
  autopayOn: number;
  renewalsDue7d: number;   // active subs whose endDate / nextRenewal falls in next 7 days
  mrrPaise: number;        // monthly recurring value of ACTIVE subs (perDelivery × 30)
  trialCashback: { credited: number; amountPaise: number };
  newThisMonth: number;
}

export interface SubEventRow {
  id: string;
  type: string;
  summary: string;
  detail: unknown;
  byRole: string | null;
  createdAt: string;
}

export interface SubScheduleDay {
  date: string;
  deliver: boolean;
  reason: string;          // "scheduled" | "skipped" | "paused" | "before start" | "ended"
}

export interface SubDetail {
  id: string;
  shortId: string;
  status: SubStatusKey;
  customer: { id: string; name: string | null; email: string | null; phone: string | null; walletPaise: number };
  address: { label: string; line1: string; line2: string | null; city: string; pincode: string; lat: number | null; lng: number | null; deliveryNote: string | null; zone: string | null; executive: string | null } | null;
  plan: { name: string; slug: string; days: number; discountBps: number };
  items: { variantId: string; qty: number; product: string; variant: string; ml: number; dailyPaise: number }[];
  perDeliveryPaise: number;
  planTotalPaise: number;
  savedPaise: number;
  startDate: string;
  endDate: string | null;
  nextDeliveryAt: string | null;
  deliverySlot: string;
  autoRenew: boolean;
  pausedFrom: string | null;
  pausedUntil: string | null;
  skipDates: string[];
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  autopay: { status: string; amountPaise: number; nextRenewalAt: string | null; attempts: number } | null;
  trialCashback: { status: string; amountPaise: number; creditedAt: string | null } | null;
  wallet: { balancePaise: number; recent: { id: string; type: string; kind: string; amountPaise: number; description: string | null; createdAt: string }[] };
  deliveries: { id: string; date: string; status: string; bottlesOut: number; bottlesIn: number }[];
  deliveryCounts: { total: number; delivered: number; skipped: number; failed: number };
  schedule: SubScheduleDay[];
  events: SubEventRow[];
}

export interface SubReports {
  byStatus: { status: string; count: number }[];
  byPlan: { plan: string; count: number; mrrPaise: number }[];
  byZone: { zone: string; count: number }[];
  autopay: { on: number; off: number };
  trial: { credited: number; eligibleActive: number; amountPaise: number };
  revenue: { activeMrrPaise: number; activeCount: number; avgPerDeliveryPaise: number };
  renewalsDue: { id: string; shortId: string; customer: string; endDate: string | null; planTotalPaise: number }[];
  rows: { shortId: string; customer: string; phone: string; plan: string; status: string; startDate: string; endDate: string; slot: string; autopay: string; perDeliveryRupees: number }[];
}
