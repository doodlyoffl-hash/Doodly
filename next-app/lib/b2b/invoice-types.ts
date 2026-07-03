/* Client-safe Business-Invoice types. Money is integer paise. */

export interface InvoiceRow {
  id: string;
  number: string;
  businessCode: string;
  businessName: string;
  gst: string | null;
  orderCode: string;
  issuedAt: string;
  dueDate: string | null;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  paidPaise: number;
  gstPaise: number;
  itemsSummary: string;
  lastUpdated: string;
}

export interface InvoicesListResponse {
  invoices: InvoiceRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface InvoiceEventRow {
  id: string;
  type: string;
  note: string | null;
  byRole: string | null;
  createdAt: string;
}

export interface InvoiceDetail {
  id: string;
  number: string;
  status: string;
  dueDate: string | null;
  voidedAt: string | null;
  notes: string | null;
  terms: string | null;
  issuedAt: string;
  gstPaise: number;
  paymentStatus: string;
  order: { code: string; deliveryDate: string; subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number; paidPaise: number; paymentTerm: string };
  business: { code: string; name: string; gst: string | null; pan: string | null; contactPerson: string; mobile: string; email: string | null; line1: string; city: string; state: string; pincode: string; billingAddress: string | null };
  items: { id: string; productName: string; quantity: number; unit: string; unitPricePaise: number; lineTotalPaise: number }[];
  payments: { id: string; amountPaise: number; method: string; reference: string | null; createdAt: string }[];
  events: InvoiceEventRow[];
}

export interface InvoiceDetailResponse {
  invoice: InvoiceDetail;
}

export interface UninvoicedOrder {
  id: string;
  code: string;
  totalPaise: number;
  deliveryDate: string;
  businessCode: string;
  businessName: string;
  itemsSummary: string;
}

export interface InvoiceReports {
  totalInvoices: number;
  byStatus: Record<string, number>;
  revenueInvoicedPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  gstPaise: number;
  overdueCount: number;
  overduePaise: number;
  byBusiness: { code?: string; name?: string; count: number; revenuePaise: number; outstandingPaise: number }[];
}
