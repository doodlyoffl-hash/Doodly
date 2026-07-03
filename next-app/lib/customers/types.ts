/* Shared response shapes for the admin Customers (CRM) module. */

export type CustomerTypeKey = "SUBSCRIPTION" | "TRIAL" | "REGULAR" | "NEW";

export interface CustomerListItem {
  id: string;
  shortId: string;
  name: string | null;
  avatarUrl: string | null;       // no photo stored on User yet — always null for now
  email: string | null;
  phone: string | null;
  status: string;                 // ACTIVE | DISABLED | LOCKED
  type: CustomerTypeKey;
  activeSubscription: boolean;
  currentPlan: string | null;
  walletPaise: number;
  loyaltyPoints: number;
  referralCode: string;
  orders: number;
  lastOrderAt: string | null;
  createdAt: string;
  pincode: string | null;
  zone: string | null;
  assignedExecutive: string | null;
  emailVerified: boolean;
}

export interface CustomerFacets {
  plans: { slug: string; name: string }[];
  zones: { id: string; name: string }[];
}

export interface CustomerListResponse {
  customers: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: CustomerFacets;
}

export interface CustomerStats {
  total: number;
  active: number;
  newThisMonth: number;
  inactive: number;          // DISABLED or LOCKED
  trial: number;             // completed a trial pack
  subscription: number;      // has an ACTIVE subscription
  awaitingVerification: number; // email not verified
  pendingPayments: number;   // has a PENDING/FAILED billing or order
  pausedSubscriptions: number;
}

export interface CustomerEventRow { id: string; type: string; summary: string; detail: unknown; byRole: string | null; createdAt: string }
export interface CustomerNoteRow { id: string; body: string; byRole: string | null; createdAt: string }

export interface CustomerProfile {
  id: string;
  shortId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  type: CustomerTypeKey;
  role: string;
  emailVerified: boolean;
  forcePwReset: boolean;
  tags: string[];
  referralCode: string;
  loyaltyPoints: number;
  walletPaise: number;
  createdAt: string;
  deletedAt: string | null;

  addresses: { id: string; label: string; line1: string; line2: string | null; city: string; pincode: string; lat: number | null; lng: number | null; isDefault: boolean; deliveryNote: string | null; zone: string | null; executive: string | null }[];
  subscriptions: { id: string; shortId: string; status: string; plan: string; nextDeliveryAt: string | null; deliverySlot: string; autoRenew: boolean }[];
  orders: { id: string; type: string; status: string; totalPaise: number; createdAt: string }[];
  ordersTotal: number;
  wallet: { balancePaise: number; txns: { id: string; type: string; kind: string; amountPaise: number; description: string | null; createdAt: string }[] };
  trialCashback: { status: string; amountPaise: number; creditedAt: string | null } | null;
  hasTrialOrder: boolean;
  referrals: { referredBy: { id: string; name: string | null } | null; invited: { id: string; name: string | null; createdAt: string; converted: boolean }[] };
  deliveries: { id: string; date: string; status: string }[];
  bottles: { pending: number; returned: number; issued: number };
  payments: { id: string; method: string; amountPaise: number; status: string; createdAt: string }[];
  invoices: { number: string; gstPaise: number; issuedAt: string }[];
  billings: { code: string; cycleNumber: number; totalPaise: number; paymentStatus: string; renewalDate: string }[];
  notifications: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[];
  supportTickets: { id: string; subject: string; status: string; createdAt: string }[]; // no ticketing model yet → []
  preferences: { emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean; pushOptIn: boolean; marketingOptIn: boolean; language: string; preferredSlot: string | null; assignedExecutive: string | null };
  events: CustomerEventRow[];
  notes: CustomerNoteRow[];
}

export interface CustomerReports {
  growth: { month: string; count: number }[];
  active: { active: number; inactive: number; total: number };
  retention: { withRepeatOrders: number; oneTime: number; rate: number };
  trial: { trials: number; converted: number; rate: number };
  subscription: { active: number; paused: number; cancelled: number };
  referral: { referrers: number; invited: number; converted: number };
  wallet: { outstandingPaise: number; cashbackPaise: number; referralPaise: number };
  revenueByCustomer: { id: string; name: string | null; phone: string | null; orders: number; revenuePaise: number }[];
  rows: { shortId: string; name: string; phone: string; email: string; type: string; status: string; plan: string; walletRupees: number; orders: number; registered: string; pincode: string; zone: string }[];
}
