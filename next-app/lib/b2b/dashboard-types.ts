/* Client-safe B2B types (no server imports). API responses serialize dates to
   ISO strings; money is always integer paise. */
import type { BusinessType, PaymentTerm, B2BOrderStatus, B2BPaymentStatus } from "./engine";

export interface BusinessRow {
  id: string;
  code: string;
  name: string;
  type: BusinessType;
  contactPerson: string;
  mobile: string;
  altMobile: string | null;
  email: string | null;
  line1: string;
  landmark: string | null;
  area: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  gst: string | null;
  pan: string | null;
  billingAddress: string | null;
  paymentTerm: PaymentTerm;
  discountBps: number;
  creditLimitPaise: number;
  preferredTime: string | null;
  deliveryNotes: string | null;
  active: boolean;
  createdAt: string;
}

export interface OrderItemRow {
  productName: string;
  quantity: number;
  unit: string;
}

export interface OrderRow {
  id: string;
  code: string;
  status: B2BOrderStatus;
  deliveryDate: string;
  deliveryTime: string;
  totalPaise: number;
  paidPaise: number;
  paymentStatus: B2BPaymentStatus;
  createdAt: string;
  business: { code: string; name: string };
  items: OrderItemRow[];
}

export interface BusinessStats {
  totalOrders: number;
  totalRevenuePaise: number;
  outstandingPaise: number;
  avgDailyQty: number;
  lastOrderAt: string | null;
  lastDeliveryAt: string | null;
  preferredProducts: { name: string; qty: number }[];
}

export interface BusinessProfileResponse {
  business: BusinessRow;
  stats: BusinessStats;
  orders: (Omit<OrderRow, "business" | "deliveryTime"> & { remarks: string | null; invoice: { number: string } | null })[];
}

export interface OrdersListResponse {
  orders: OrderRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrderEventRow {
  id: string;
  type: "CREATED" | "STATUS" | "PAYMENT" | "INVOICE" | "NOTE" | "EDIT";
  fromStatus: B2BOrderStatus | null;
  toStatus: B2BOrderStatus | null;
  note: string | null;
  createdAt: string;
}

export interface OrderDetailResponse {
  order: {
    id: string;
    code: string;
    status: B2BOrderStatus;
    deliveryDate: string;
    deliveryTime: string;
    deliveryNotes: string | null;
    subtotalPaise: number;
    discountPaise: number;
    taxPaise: number;
    totalPaise: number;
    paidPaise: number;
    paymentTerm: PaymentTerm;
    paymentStatus: B2BPaymentStatus;
    remarks: string | null;
    createdAt: string;
    items: { id: string; productSlug: string; productName: string; quantity: number; unit: string; unitPricePaise: number; lineTotalPaise: number }[];
    business: BusinessRow;
    payments: { id: string; amountPaise: number; method: string; reference: string | null; note: string | null; createdAt: string }[];
    invoice: { number: string; issuedAt: string } | null;
    events: OrderEventRow[];
  };
}

export interface B2BReportsResponse {
  totalOrders: number;
  totalRevenuePaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  statusCounts: Record<string, number>;
  topBusinesses: { code?: string; name?: string; orders: number; revenuePaise: number }[];
  topProducts: { name: string; qty: number; revenuePaise: number }[];
}
