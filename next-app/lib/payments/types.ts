/* Shared response shapes for the admin Payments ledger module. */

export interface PaymentListItem {
  id: string;
  code: string;
  transactionId: string | null;
  source: string;
  status: string;
  customer: { id: string; name: string | null; phone: string | null };
  orderId: string | null;
  subscriptionId: string | null;
  invoiceNumber: string | null;
  method: string;
  gateway: string;
  amountPaise: number;
  walletUsedPaise: number;
  gstPaise: number;
  discountPaise: number;
  netPaise: number;
  refundedPaise: number;
  collectedByName: string | null;
  reconciled: boolean;
  createdAt: string;
}

export interface PaymentFacets {
  methods: string[];
  gateways: string[];
}

export interface PaymentListResponse {
  payments: PaymentListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: PaymentFacets;
}

export interface PaymentStats {
  totalPayments: number;
  todaysCollectionsPaise: number;
  monthlyCollectionsPaise: number;
  successful: number;
  pending: number;
  failed: number;
  refunded: number;
  walletPaymentsPaise: number;
  autopayCollectionsPaise: number;
  outstandingPaise: number;
  totalRevenuePaise: number;
}

export interface PaymentEventRow { id: string; type: string; summary: string; detail: unknown; byRole: string | null; createdAt: string }
export interface RefundRow { id: string; amountPaise: number; reason: string | null; toWallet: boolean; status: string; reference: string; createdAt: string }
export interface AttemptRow { id: string; attemptNo: number; status: string; gatewayRef: string | null; error: string | null; createdAt: string }

export interface PaymentDetail {
  id: string;
  code: string;
  transactionId: string | null;
  source: string;
  status: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  order: { id: string; type: string; status: string; totalPaise: number } | null;
  subscription: { id: string; plan: string; status: string } | null;
  billing: { code: string; cycleNumber: number; paymentStatus: string } | null;
  method: string;
  gateway: string;
  amountPaise: number;
  walletUsedPaise: number;
  gstPaise: number;
  discountPaise: number;
  netPaise: number;
  refundedPaise: number;
  refundablePaise: number;
  invoiceNumber: string | null;
  collectedByName: string | null;
  reconciled: boolean;
  notes: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  gatewayResponse: unknown;
  createdAt: string;
  updatedAt: string;
  walletTxns: { id: string; type: string; kind: string; amountPaise: number; description: string | null; createdAt: string }[];
  refunds: RefundRow[];
  attempts: AttemptRow[];
  events: PaymentEventRow[];
}

export interface GatewayRow { id: string; name: string; label: string; enabled: boolean; mode: string; keyId: string | null; webhookConfigured: boolean; supportsRefund: boolean; liveKeysPresent: boolean; webhookSecretPresent: boolean }

export interface PaymentReports {
  daily: { date: string; count: number; collectedPaise: number }[];
  monthly: { month: string; count: number; collectedPaise: number }[];
  byMethod: { method: string; count: number; collectedPaise: number }[];
  byGateway: { gateway: string; count: number; collectedPaise: number }[];
  byStatus: { status: string; count: number }[];
  refunds: { count: number; amountPaise: number; toWalletPaise: number };
  wallet: { usedPaise: number; cashbackPaise: number; referralPaise: number };
  autopay: { count: number; collectedPaise: number };
  revenue: { grossPaise: number; netPaise: number; gstPaise: number; discountPaise: number };
  rows: { code: string; date: string; customer: string; method: string; gateway: string; source: string; status: string; amountRupees: number; walletRupees: number; gstRupees: number; netRupees: number; invoice: string }[];
}
