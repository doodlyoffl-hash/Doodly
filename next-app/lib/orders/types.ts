/* Client-safe customer-order types. Money is integer paise; dates are ISO strings. */

export type OrderFulfilment =
  | "PROCESSING" | "CONFIRMED" | "PREPARING" | "QUALITY_CHECK" | "PACKED"
  | "OUT_FOR_DELIVERY" | "ARRIVING" | "DELIVERED" | "CANCELLED";

export const FULFILMENT_LABEL: Record<OrderFulfilment, string> = {
  PROCESSING: "Processing", CONFIRMED: "Confirmed", PREPARING: "Preparing", QUALITY_CHECK: "Quality checked",
  PACKED: "Packed", OUT_FOR_DELIVERY: "Out for delivery", ARRIVING: "Arriving soon", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

export interface OrderListItem {
  id: string;
  number: string;
  type: string;
  paymentStatus: string;
  fulfilment: OrderFulfilment;
  cancelled: boolean;
  totalPaise: number;
  createdAt: string;
  itemsSummary: string;
  itemCount: number;
  invoiceNumber: string | null;
  deliveryDate: string | null;
  deliverySlot: string | null;
  /** Customer-friendly delivery stage (e.g. "Delivery Executive Assigned") — no exec personal details. */
  deliveryStage: string | null;
}

export interface OrdersListResponse {
  orders: OrderListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrderTimelineEvent {
  id: string;
  type: string;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  number: string;
  type: string;
  paymentStatus: string;
  fulfilment: OrderFulfilment;
  cancelled: boolean;
  createdAt: string;
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  items: { id: string; productName: string; variantLabel: string | null; quantity: number; unitPricePaise: number; lineTotalPaise: number }[];
  timeline: OrderTimelineEvent[];
  delivery: { status: string; stage: string; assigned: boolean; date: string; slot: string | null; deliveredAt: string | null; driverName: string | null; driverPhone: string | null; address: { line1: string; line2: string | null; city: string; pincode: string; lat: number | null; lng: number | null } | null } | null;
  payment: { method: string; status: string; amountPaise: number } | null;
  invoice: { number: string; issuedAt: string } | null;
  walletTxns: { id: string; type: string; kind: string; amountPaise: number; description: string | null; createdAt: string }[];
  bottles: { id: string; event: string; qty: number; createdAt: string }[];
}

export interface OrderDetailResponse {
  detail: OrderDetail;
}
