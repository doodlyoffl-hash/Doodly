/* =============================================================
   DOODLY — B2B Orders server-side query engine.
   One Prisma `where` builder shared by the list, the summary and the export, so the three can
   never disagree about "the filtered set". Every filter is a DB query (no client-side filtering
   of pre-loaded rows), combinable, and rides the existing BusinessOrder indexes. All money in
   paise. Date bounds are day-inclusive.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { MilkReport } from "@/lib/milk/reports";

const rup = (p: number) => "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN");

export type B2BOrderStatusValue = "PENDING" | "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "COMPLETED" | "CANCELLED";
export type B2BPayStatusValue = "PENDING" | "PARTIAL" | "PAID" | "CREDIT";
export type DateType = "created" | "delivery" | "delivered" | "invoice" | "updated";
export type InvoiceFilter = "generated" | "pending" | "sent";
export type SortKey = "newest" | "oldest" | "delivery_desc" | "delivery_asc" | "business_asc" | "business_desc" | "value_desc" | "value_asc" | "revenue_desc" | "revenue_asc" | "invoice_desc" | "invoice_asc";

export interface B2BOrderFilters {
  dateType?: DateType;
  from?: string; to?: string;                 // "YYYY-MM-DD" inclusive
  q?: string;                                 // search
  statuses?: B2BOrderStatusValue[];
  businessId?: string;
  unit?: string;                              // "KG" | "Litres" | "Bottles"
  paymentStatuses?: B2BPayStatusValue[];
  invoice?: InvoiceFilter;
  valueMin?: number; valueMax?: number;       // Order.totalPaise range (paise)
  revenueMin?: number; revenueMax?: number;   // recognised revenuePaise range (paise)
  qtyUnit?: string; qtyMin?: number; qtyMax?: number;  // per-line quantity range for a given unit
  execId?: string;                            // filter by a specific delivery executive (Driver.id)
  execState?: "assigned" | "unassigned" | "auto" | "manual";
}

const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dayEndExclusive = (iso: string) => new Date(dayStart(iso).getTime() + 86400000);

function rangeFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: dayStart(from) } : {}), ...(to ? { lt: dayEndExclusive(to) } : {}) };
}
function intRange(min?: number, max?: number): Prisma.IntFilter | undefined {
  if (min == null && max == null) return undefined;
  return { ...(min != null ? { gte: Math.round(min) } : {}), ...(max != null ? { lte: Math.round(max) } : {}) };
}
function floatRange(min?: number, max?: number): Prisma.FloatFilter | undefined {
  if (min == null && max == null) return undefined;
  return { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) };
}

/** THE authoritative filtered-set predicate (shared by list + summary + export). */
export function b2bOrderWhere(f: B2BOrderFilters): Prisma.BusinessOrderWhereInput {
  const where: Prisma.BusinessOrderWhereInput = {};
  const AND: Prisma.BusinessOrderWhereInput[] = [];

  // ---- date range on the CHOSEN date field ----
  const dr = rangeFilter(f.from, f.to);
  if (dr) {
    switch (f.dateType) {
      case "delivery": where.deliveryDate = dr; break;
      case "delivered": where.deliveredAt = dr; break;
      case "updated": where.updatedAt = dr; break;
      case "invoice": where.invoice = { issuedAt: dr }; break;
      case "created": default: where.createdAt = dr; break;
    }
  }

  if (f.statuses?.length) where.status = { in: f.statuses };
  if (f.businessId) where.businessId = f.businessId;
  if (f.paymentStatuses?.length) where.paymentStatus = { in: f.paymentStatuses };

  // ---- delivery-executive assignment ----
  if (f.execState === "assigned") where.driverId = { not: null };
  else if (f.execState === "unassigned") where.driverId = null;
  if (f.execState === "auto") where.assignmentMode = "AUTO";
  else if (f.execState === "manual") where.assignmentMode = "MANUAL";
  if (f.execId) where.driverId = f.execId;   // a specific exec overrides the assigned/unassigned state

  const value = intRange(f.valueMin, f.valueMax); if (value) where.totalPaise = value;
  const rev = intRange(f.revenueMin, f.revenueMax); if (rev) where.revenuePaise = rev;

  // ---- invoice presence / email state ----
  if (f.invoice === "generated") where.invoice = { ...(where.invoice as object), isNot: null } as Prisma.BusinessInvoiceNullableRelationFilter;
  else if (f.invoice === "pending") where.invoice = { is: null };
  else if (f.invoice === "sent") where.invoice = { ...(where.invoice as object), is: { emailStatus: "SENT" } } as Prisma.BusinessInvoiceNullableRelationFilter;

  // ---- unit + per-line quantity range (merged into one items.some so they match the SAME line) ----
  const itemsSome: Prisma.BusinessOrderItemWhereInput = {};
  if (f.unit) itemsSome.unit = f.unit;
  const qty = floatRange(f.qtyMin, f.qtyMax);
  if (qty) { itemsSome.quantity = qty; if (f.qtyUnit) itemsSome.unit = f.qtyUnit; }
  if (Object.keys(itemsSome).length) where.items = { some: itemsSome };

  // ---- search (case-insensitive partial across order/business/invoice/product) ----
  if (f.q?.trim()) {
    const s = f.q.trim();
    const ci = { contains: s, mode: "insensitive" as const };
    AND.push({ OR: [
      { code: ci },
      { business: { name: ci } }, { business: { code: ci } }, { business: { contactPerson: ci } },
      { business: { mobile: { contains: s } } }, { business: { email: ci } }, { business: { gst: { contains: s, mode: "insensitive" } } },
      { invoice: { is: { number: ci } } },
      { items: { some: { productName: ci } } },
    ] });
  }

  if (AND.length) where.AND = AND;
  return where;
}

const ORDER_BY: Record<SortKey, Prisma.BusinessOrderOrderByWithRelationInput> = {
  newest: { createdAt: "desc" }, oldest: { createdAt: "asc" },
  delivery_desc: { deliveryDate: "desc" }, delivery_asc: { deliveryDate: "asc" },
  business_asc: { business: { name: "asc" } }, business_desc: { business: { name: "desc" } },
  value_desc: { totalPaise: "desc" }, value_asc: { totalPaise: "asc" },
  revenue_desc: { revenuePaise: "desc" }, revenue_asc: { revenuePaise: "asc" },
  invoice_desc: { invoice: { number: "desc" } }, invoice_asc: { invoice: { number: "asc" } },
};

export interface B2BOrderRow {
  id: string; code: string; status: string; paymentStatus: string;
  businessId: string; businessCode: string; businessName: string;
  deliveryDate: string; deliveredAt: string | null; createdAt: string; updatedAt: string;
  totalPaise: number; paidPaise: number; revenuePaise: number | null;
  units: string[]; totalQty: number;
  items: { productName: string; quantity: number; unit: string }[];
  invoiceNumber: string | null; invoiceStatus: string | null; invoiceEmail: string | null;
  execId: string | null; execName: string | null; assignmentMode: string | null; assignedAt: string | null;
}

/** Paginated, sorted, filtered list. */
export async function queryB2BOrders(f: B2BOrderFilters, opts: { sort?: SortKey; page?: number; pageSize?: number } = {}) {
  const where = b2bOrderWhere(f);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const orderBy = ORDER_BY[opts.sort ?? "newest"] ?? ORDER_BY.newest;

  const [rows, total] = await Promise.all([
    db.businessOrder.findMany({
      where, orderBy, take: pageSize, skip: (page - 1) * pageSize,
      select: {
        id: true, code: true, status: true, paymentStatus: true, deliveryDate: true, deliveredAt: true, createdAt: true, updatedAt: true,
        totalPaise: true, paidPaise: true, revenuePaise: true, assignmentMode: true, assignedAt: true,
        business: { select: { id: true, code: true, name: true } },
        items: { select: { productName: true, quantity: true, unit: true } },
        invoice: { select: { number: true, status: true, emailStatus: true } },
        driver: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    db.businessOrder.count({ where }),
  ]);

  const orders: B2BOrderRow[] = rows.map((o) => ({
    id: o.id, code: o.code, status: o.status, paymentStatus: o.paymentStatus,
    businessId: o.business.id, businessCode: o.business.code, businessName: o.business.name,
    deliveryDate: o.deliveryDate.toISOString(), deliveredAt: o.deliveredAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
    totalPaise: o.totalPaise, paidPaise: o.paidPaise, revenuePaise: o.revenuePaise,
    units: [...new Set(o.items.map((i) => i.unit))],
    totalQty: Math.round(o.items.reduce((s, i) => s + i.quantity, 0) * 1000) / 1000,
    items: o.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unit: i.unit })),
    invoiceNumber: o.invoice?.number ?? null, invoiceStatus: o.invoice?.status ?? null, invoiceEmail: o.invoice?.emailStatus ?? null,
    execId: o.driver?.id ?? null, execName: o.driver?.user?.name ?? null, assignmentMode: o.assignmentMode ?? null, assignedAt: o.assignedAt?.toISOString() ?? null,
  }));
  return { orders, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Dashboard summary over the SAME filtered set — updates as filters change. */
export async function b2bOrdersSummary(f: B2BOrderFilters) {
  const where = b2bOrderWhere(f);
  const [byStatus, totals, businesses, itemsAgg, kgAgg, litreAgg] = await Promise.all([
    db.businessOrder.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.businessOrder.aggregate({ where, _count: { _all: true }, _sum: { totalPaise: true, revenuePaise: true, paidPaise: true } }),
    db.businessOrder.findMany({ where, select: { businessId: true }, distinct: ["businessId"] }),
    db.businessOrderItem.aggregate({ where: { order: where }, _sum: { quantity: true } }),
    db.businessOrderItem.aggregate({ where: { order: where, unit: "KG" }, _sum: { quantity: true } }),
    db.businessOrderItem.aggregate({ where: { order: where, unit: "Litres" }, _sum: { quantity: true } }),
  ]);
  const c = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    totalOrders: totals._count._all,
    delivered: c("DELIVERED") + c("COMPLETED"),
    pending: c("PENDING") + c("CONFIRMED") + c("PREPARING") + c("OUT_FOR_DELIVERY"),
    cancelled: c("CANCELLED"),
    totalValuePaise: totals._sum.totalPaise ?? 0,
    totalRevenuePaise: totals._sum.revenuePaise ?? 0,
    totalPaidPaise: totals._sum.paidPaise ?? 0,
    totalQty: Math.round((itemsAgg._sum.quantity ?? 0) * 1000) / 1000,
    totalKg: Math.round((kgAgg._sum.quantity ?? 0) * 1000) / 1000,
    totalLitres: Math.round((litreAgg._sum.quantity ?? 0) * 1000) / 1000,
    totalBusinesses: businesses.length,
    byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  };
}

/** Flat, printable table of the FILTERED orders (reused by the export CSV/XLS/PDF renderers).
 *  Fetches all matching rows up to `cap` so the export == exactly the on-screen filtered set. */
export async function b2bOrdersReport(f: B2BOrderFilters, opts: { sort?: SortKey; subtitle?: string; cap?: number } = {}): Promise<MilkReport> {
  const { orders, total } = await queryB2BOrders(f, { sort: opts.sort, page: 1, pageSize: Math.min(opts.cap ?? 5000, 5000) });
  const rows = orders.map((o) => [
    o.code, o.businessName, o.status, o.paymentStatus, o.deliveryDate.slice(0, 10),
    o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join("; "),
    String(o.totalQty), rup(o.totalPaise), o.revenuePaise != null ? rup(o.revenuePaise) : "—", o.invoiceNumber ?? "—", o.execName ?? "—",
  ]);
  const totalValue = orders.reduce((s, o) => s + o.totalPaise, 0);
  const totalRev = orders.reduce((s, o) => s + (o.revenuePaise ?? 0), 0);
  const capped = total > orders.length ? ` (showing first ${orders.length} of ${total})` : "";
  return {
    type: "b2bOrders" as unknown as MilkReport["type"],
    title: "B2B Orders",
    subtitle: `${(opts.subtitle ?? "All orders")}${capped}`,
    rowCount: rows.length,
    columns: [{ label: "Order" }, { label: "Business" }, { label: "Status" }, { label: "Payment" }, { label: "Delivery" }, { label: "Items" }, { label: "Qty", right: true }, { label: "Value", right: true }, { label: "Revenue", right: true }, { label: "Invoice" }, { label: "Executive" }],
    rows,
    totalRow: ["TOTAL", `${orders.length} order(s)`, "", "", "", "", "", rup(totalValue), rup(totalRev), "", ""],
  };
}

/** Parse the filter set from URL search params (shared by list + summary + export routes). */
export function parseB2BFilters(sp: URLSearchParams): B2BOrderFilters {
  const csv = (k: string) => { const v = sp.get(k); return v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined; };
  const num = (k: string) => { const v = sp.get(k); return v != null && v !== "" ? Number(v) : undefined; };
  return {
    dateType: (sp.get("dateType") as DateType) ?? undefined,
    from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined,
    q: sp.get("q") ?? undefined,
    statuses: csv("statuses") as B2BOrderStatusValue[] | undefined,
    businessId: sp.get("businessId") ?? undefined,
    unit: sp.get("unit") ?? undefined,
    paymentStatuses: csv("paymentStatuses") as B2BPayStatusValue[] | undefined,
    invoice: (sp.get("invoice") as InvoiceFilter) ?? undefined,
    valueMin: num("valueMin"), valueMax: num("valueMax"),
    revenueMin: num("revenueMin"), revenueMax: num("revenueMax"),
    qtyUnit: sp.get("qtyUnit") ?? undefined, qtyMin: num("qtyMin"), qtyMax: num("qtyMax"),
    execId: sp.get("execId") ?? undefined,
    execState: (sp.get("execState") as B2BOrderFilters["execState"]) ?? undefined,
  };
}
