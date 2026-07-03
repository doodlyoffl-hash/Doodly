/* =============================================================
   DOODLY — Customers (CRM) service layer
   The single source of truth behind /api/admin/customers/*.
   A customer = a User with role = CUSTOMER. This layer aggregates
   the existing relations (addresses, wallet, orders, subscriptions,
   referrals, deliveries, bottles, payments, invoices, notifications)
   and adds the CRM layer (notes, activity/status timeline, prefs).
   Every mutation appends a CustomerEvent (audit trail).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { adminCredit, adminDebit } from "@/lib/wallet/service";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type {
  CustomerListResponse, CustomerListItem, CustomerStats, CustomerProfile,
  CustomerReports, CustomerTypeKey,
} from "./types";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

type Tx = Prisma.TransactionClient;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(1); return x; };
const shortId = (id: string) => id.slice(-8).toUpperCase();

export async function logCustomerEvent(client: Tx | typeof db, userId: string, type: string, summary: string, detail: unknown, actor: Actor) {
  await client.customerEvent.create({
    data: { userId, type, summary, detail: detail === undefined ? Prisma.JsonNull : (detail as Prisma.InputJsonValue), byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip },
  });
}

function deriveType(hasActiveSub: boolean, hasTrial: boolean, orders: number): CustomerTypeKey {
  if (hasActiveSub) return "SUBSCRIPTION";
  if (hasTrial) return "TRIAL";
  if (orders > 0) return "REGULAR";
  return "NEW";
}

// ---------------------------------------------------------------- stats

export async function customerStats(): Promise<CustomerStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const base = { role: "CUSTOMER" as const, deletedAt: null };

  const [total, active, newThisMonth, inactive, trial, subscription, awaiting, pendingBilling, pendingOrders, paused] = await Promise.all([
    db.user.count({ where: base }),
    db.user.count({ where: { ...base, status: "ACTIVE" } }),
    db.user.count({ where: { ...base, createdAt: { gte: monthStart } } }),
    db.user.count({ where: { ...base, status: { in: ["DISABLED", "LOCKED"] } } }),
    db.user.count({ where: { ...base, orders: { some: { type: "SAMPLE" } } } }),
    db.user.count({ where: { ...base, subscriptions: { some: { status: "ACTIVE" } } } }),
    db.user.count({ where: { ...base, emailVerified: null } }),
    db.user.count({ where: { ...base, billings: { some: { paymentStatus: { in: ["PENDING", "FAILED", "PARTIAL"] } } } } }),
    db.user.count({ where: { ...base, orders: { some: { status: { in: ["PENDING", "FAILED"] } } } } }),
    db.user.count({ where: { ...base, subscriptions: { some: { status: { in: ["PAUSED", "VACATION"] } } } } }),
  ]);

  // pending payments = customers with a pending billing OR a pending order (dedupe is acceptable as an at-a-glance KPI)
  return {
    total, active, newThisMonth, inactive, trial, subscription,
    awaitingVerification: awaiting,
    pendingPayments: Math.max(pendingBilling, pendingOrders),
    pausedSubscriptions: paused,
  };
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  status?: string; type?: string; planSlug?: string; zoneId?: string; pincode?: string;
  walletMin?: number; walletMax?: number; regFrom?: string; regTo?: string; orderFrom?: string; orderTo?: string;
  q?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number;
}

const listInclude = {
  addresses: { where: { isDefault: true }, take: 1, select: { pincode: true, zone: { select: { name: true, executive: true } } } },
  subscriptions: { where: { status: "ACTIVE" as const }, take: 1, select: { plan: { select: { name: true } } } },
  preference: { select: { assignedExecutive: true } },
  orders: { orderBy: { createdAt: "desc" as const }, take: 1, select: { createdAt: true } },
  _count: { select: { orders: true, subscriptions: true } },
} satisfies Prisma.UserInclude;

export async function listCustomers(args: ListArgs): Promise<CustomerListResponse> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(1000, Math.max(5, args.pageSize ?? 20));
  const and: Prisma.UserWhereInput[] = [{ role: "CUSTOMER" }, { deletedAt: null }];

  if (args.status) and.push({ status: args.status as never });
  if (args.type === "SUBSCRIPTION") and.push({ subscriptions: { some: { status: "ACTIVE" } } });
  else if (args.type === "TRIAL") and.push({ orders: { some: { type: "SAMPLE" } }, subscriptions: { none: { status: "ACTIVE" } } });
  else if (args.type === "INACTIVE") and.push({ status: { in: ["DISABLED", "LOCKED"] } });
  else if (args.type === "NEW") and.push({ orders: { none: {} } });
  if (args.planSlug) and.push({ subscriptions: { some: { status: "ACTIVE", plan: { slug: args.planSlug } } } });
  if (args.zoneId) and.push({ addresses: { some: { zoneId: args.zoneId } } });
  if (args.pincode) and.push({ addresses: { some: { pincode: { contains: args.pincode } } } });
  if (args.walletMin != null) and.push({ walletPaise: { gte: args.walletMin } });
  if (args.walletMax != null) and.push({ walletPaise: { lte: args.walletMax } });
  if (args.regFrom || args.regTo) {
    const r: Prisma.DateTimeFilter = {};
    if (args.regFrom) r.gte = startOfDay(new Date(args.regFrom));
    if (args.regTo) r.lte = addDays(startOfDay(new Date(args.regTo)), 1);
    and.push({ createdAt: r });
  }
  if (args.orderFrom || args.orderTo) {
    const r: Prisma.DateTimeFilter = {};
    if (args.orderFrom) r.gte = startOfDay(new Date(args.orderFrom));
    if (args.orderTo) r.lte = addDays(startOfDay(new Date(args.orderTo)), 1);
    and.push({ orders: { some: { createdAt: r } } });
  }
  if (args.q?.trim()) {
    const q = args.q.trim();
    and.push({ OR: [
      { id: { contains: q.toLowerCase() } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { referralCode: { contains: q, mode: "insensitive" } },
    ] });
  }
  const where: Prisma.UserWhereInput = { AND: and };

  const dir = args.dir ?? (args.sort === "name" ? "asc" : "desc");
  const orderBy: Prisma.UserOrderByWithRelationInput =
    args.sort === "name" ? { name: dir }
    : args.sort === "orders" ? { orders: { _count: dir } }
    : args.sort === "wallet" ? { walletPaise: dir }
    : { createdAt: dir }; // registered / latest activity

  const [rows, total, plans, zones] = await Promise.all([
    db.user.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: listInclude }),
    db.user.count({ where }),
    db.plan.findMany({ where: { active: true }, orderBy: { days: "asc" }, select: { slug: true, name: true } }),
    db.deliveryZone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const customers: CustomerListItem[] = rows.map((c) => {
    const addr = c.addresses[0];
    const hasActiveSub = c.subscriptions.length > 0;
    return {
      id: c.id, shortId: shortId(c.id), name: c.name, avatarUrl: null, email: c.email, phone: c.phone, status: c.status,
      type: deriveType(hasActiveSub, false, c._count.orders),
      activeSubscription: hasActiveSub, currentPlan: c.subscriptions[0]?.plan.name ?? null,
      walletPaise: c.walletPaise, loyaltyPoints: c.loyaltyPoints, referralCode: c.referralCode,
      orders: c._count.orders, lastOrderAt: c.orders[0]?.createdAt.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      pincode: addr?.pincode ?? null, zone: addr?.zone?.name ?? null,
      assignedExecutive: c.preference?.assignedExecutive ?? addr?.zone?.executive ?? null,
      emailVerified: !!c.emailVerified,
    };
  });
  return { customers, total, page, pageSize, facets: { plans, zones } };
}

// ---------------------------------------------------------------- profile

export async function getCustomerProfile(id: string): Promise<CustomerProfile | null> {
  const c = await db.user.findFirst({
    where: { id, role: "CUSTOMER" },
    include: {
      addresses: { include: { zone: { select: { name: true, executive: true } } }, orderBy: { isDefault: "desc" } },
      subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: { select: { name: true } } } },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
      walletTxns: { orderBy: { createdAt: "desc" }, take: 12 },
      trialCashback: true,
      referredBy: { select: { id: true, name: true } },
      referrals: { select: { id: true, name: true, createdAt: true, orders: { where: { status: "PAID" }, take: 1, select: { id: true } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 8 },
      invoices: { orderBy: { issuedAt: "desc" }, take: 8 },
      billings: { orderBy: { createdAt: "desc" }, take: 8 },
      notifications: { orderBy: { createdAt: "desc" }, take: 8 },
      preference: true,
      customerEvents: { orderBy: { createdAt: "desc" }, take: 40 },
      customerNotes: { orderBy: { createdAt: "desc" }, take: 30 },
      _count: { select: { orders: true } },
    },
  });
  if (!c) return null;

  const [deliveries, bottleGroups] = await Promise.all([
    db.delivery.findMany({ where: { subscription: { userId: id } }, orderBy: { date: "desc" }, take: 8, select: { id: true, date: true, status: true } }),
    db.bottleLedger.groupBy({ by: ["event"], where: { userId: id }, _sum: { qty: true } }),
  ]);
  const bsum = (e: string) => bottleGroups.find((g) => g.event === e)?._sum.qty ?? 0;
  const hasActiveSub = c.subscriptions.some((s) => s.status === "ACTIVE");
  const hasTrial = c.orders.some((o) => o.type === "SAMPLE") || !!c.trialCashback;

  return {
    id: c.id, shortId: shortId(c.id), name: c.name, email: c.email, phone: c.phone, status: c.status,
    type: deriveType(hasActiveSub, hasTrial, c._count.orders), role: c.role, emailVerified: !!c.emailVerified, forcePwReset: c.forcePwReset,
    tags: c.tags, referralCode: c.referralCode, loyaltyPoints: c.loyaltyPoints, walletPaise: c.walletPaise,
    createdAt: c.createdAt.toISOString(), deletedAt: c.deletedAt?.toISOString() ?? null,
    addresses: c.addresses.map((a) => ({ id: a.id, label: a.label, line1: a.line1, line2: a.line2, city: a.city, pincode: a.pincode, lat: a.lat, lng: a.lng, isDefault: a.isDefault, deliveryNote: a.deliveryNote, zone: a.zone?.name ?? null, executive: a.zone?.executive ?? null })),
    subscriptions: c.subscriptions.map((s) => ({ id: s.id, shortId: shortId(s.id), status: s.status, plan: s.plan.name, nextDeliveryAt: s.nextDeliveryAt?.toISOString() ?? null, deliverySlot: s.deliverySlot, autoRenew: s.autoRenew })),
    orders: c.orders.map((o) => ({ id: o.id, type: o.type, status: o.status, totalPaise: o.totalPaise, createdAt: o.createdAt.toISOString() })),
    ordersTotal: c._count.orders,
    wallet: { balancePaise: c.walletPaise, txns: c.walletTxns.map((w) => ({ id: w.id, type: w.type, kind: w.kind, amountPaise: w.amountPaise, description: w.description, createdAt: w.createdAt.toISOString() })) },
    trialCashback: c.trialCashback ? { status: c.trialCashback.status, amountPaise: c.trialCashback.amountPaise, creditedAt: c.trialCashback.creditedAt?.toISOString() ?? null } : null,
    hasTrialOrder: hasTrial,
    referrals: { referredBy: c.referredBy ? { id: c.referredBy.id, name: c.referredBy.name } : null, invited: c.referrals.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString(), converted: r.orders.length > 0 })) },
    deliveries: deliveries.map((d) => ({ id: d.id, date: d.date.toISOString(), status: d.status })),
    bottles: { pending: bsum("ISSUED") - bsum("RETURNED") - bsum("LOST"), returned: bsum("RETURNED"), issued: bsum("ISSUED") },
    payments: c.payments.map((p) => ({ id: p.id, method: p.method, amountPaise: p.amountPaise, status: p.status, createdAt: p.createdAt.toISOString() })),
    invoices: c.invoices.map((i) => ({ number: i.number, gstPaise: i.gstPaise, issuedAt: i.issuedAt.toISOString() })),
    billings: c.billings.map((b) => ({ code: b.code, cycleNumber: b.cycleNumber, totalPaise: b.totalPaise, paymentStatus: b.paymentStatus, renewalDate: b.renewalDate.toISOString() })),
    notifications: c.notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
    supportTickets: [], // no ticketing model connected yet
    preferences: c.preference
      ? { emailOptIn: c.preference.emailOptIn, smsOptIn: c.preference.smsOptIn, whatsappOptIn: c.preference.whatsappOptIn, pushOptIn: c.preference.pushOptIn, marketingOptIn: c.preference.marketingOptIn, language: c.preference.language, preferredSlot: c.preference.preferredSlot, assignedExecutive: c.preference.assignedExecutive }
      : { emailOptIn: true, smsOptIn: false, whatsappOptIn: false, pushOptIn: true, marketingOptIn: true, language: "en", preferredSlot: null, assignedExecutive: null },
    events: c.customerEvents.map((e) => ({ id: e.id, type: e.type, summary: e.summary, detail: e.detail, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
    notes: c.customerNotes.map((n) => ({ id: n.id, body: n.body, byRole: n.byRole, createdAt: n.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------- mutations

async function ensureCustomer(id: string) {
  const c = await db.user.findFirst({ where: { id, role: "CUSTOMER" }, select: { id: true, name: true, email: true, phone: true, status: true, tags: true } });
  if (!c) throw Errors.notFound("Customer not found.");
  return c;
}

export interface CreateArgs { name?: string; email?: string; phone?: string; tags?: string[] }

export async function createCustomer(args: CreateArgs, actor: Actor) {
  if (!args.email && !args.phone) throw Errors.badRequest("Provide at least an email or a mobile number.");
  const dup = await db.user.findFirst({ where: { OR: [args.email ? { email: args.email } : {}, args.phone ? { phone: args.phone } : {}].filter((x) => Object.keys(x).length) as Prisma.UserWhereInput[] }, select: { id: true } });
  if (dup) throw Errors.conflict("A user with that email or mobile already exists.");
  const c = await db.user.create({ data: { role: "CUSTOMER", name: args.name, email: args.email, phone: args.phone, tags: args.tags ?? [], status: "ACTIVE" }, select: { id: true } });
  await logCustomerEvent(db, c.id, "CREATED", "Customer account created", { name: args.name, email: args.email, phone: args.phone }, actor);
  return { id: c.id, shortId: shortId(c.id) };
}

export interface UpdateArgs { name?: string; email?: string; phone?: string; tags?: string[] }

export async function updateCustomer(id: string, args: UpdateArgs, actor: Actor) {
  const cur = await ensureCustomer(id);
  const data: Prisma.UserUpdateInput = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (args.name !== undefined && args.name !== cur.name) { data.name = args.name; diff.name = { from: cur.name, to: args.name }; }
  if (args.email !== undefined && args.email !== cur.email) {
    if (args.email) { const dup = await db.user.findFirst({ where: { email: args.email, NOT: { id } }, select: { id: true } }); if (dup) throw Errors.conflict("That email is already in use."); }
    data.email = args.email || null; diff.email = { from: cur.email, to: args.email };
  }
  if (args.phone !== undefined && args.phone !== cur.phone) {
    if (args.phone) { const dup = await db.user.findFirst({ where: { phone: args.phone, NOT: { id } }, select: { id: true } }); if (dup) throw Errors.conflict("That mobile number is already in use."); }
    data.phone = args.phone || null; diff.phone = { from: cur.phone, to: args.phone };
  }
  if (args.tags !== undefined) { data.tags = args.tags; diff.tags = { from: cur.tags, to: args.tags }; }
  if (!Object.keys(diff).length) return { id, changed: false };
  await db.user.update({ where: { id }, data });
  await logCustomerEvent(db, id, "UPDATED", `Profile updated (${Object.keys(diff).join(", ")})`, diff, actor);
  return { id, changed: true };
}

const STATUS_MAP: Record<string, { status?: "ACTIVE" | "DISABLED" | "LOCKED"; deletedAt?: Date | null; verb: string }> = {
  activate: { status: "ACTIVE", deletedAt: null, verb: "activated" },
  deactivate: { status: "DISABLED", verb: "deactivated" },
  suspend: { status: "LOCKED", verb: "suspended" },
  delete: { status: "DISABLED", deletedAt: new Date(), verb: "deleted (soft)" },
};

export async function setStatus(id: string, action: string, reason: string | undefined, actor: Actor) {
  await ensureCustomer(id);
  const m = STATUS_MAP[action];
  if (!m) throw Errors.badRequest("Unknown status action.");
  const data: Prisma.UserUpdateInput = {};
  if (m.status) data.status = m.status;
  if (m.deletedAt !== undefined) data.deletedAt = m.deletedAt;
  await db.user.update({ where: { id }, data });
  await logCustomerEvent(db, id, "STATUS", `Account ${m.verb}${reason ? ` — ${reason}` : ""}`, { action, reason: reason ?? null }, actor);
  return { id, action };
}

export async function resetPassword(id: string, actor: Actor) {
  await ensureCustomer(id);
  const raw = generateToken();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { forcePwReset: true } });
    await tx.passwordResetToken.create({ data: { userId: id, tokenHash: hashToken(raw), expiresAt: addDays(new Date(), 1) } });
    await logCustomerEvent(tx, id, "PASSWORD", "Password reset issued (customer must set a new password)", null, actor);
  });
  const link = `/reset-password?token=${raw}`;
  return { id, resetLink: link };
}

export async function walletAdjust(id: string, p: { direction: "credit" | "debit"; amountPaise: number; reason: string }, actor: Actor) {
  await ensureCustomer(id);
  if (p.amountPaise <= 0) throw Errors.badRequest("Amount must be positive.");
  const res = p.direction === "credit"
    ? await adminCredit({ userId: id, amountPaise: p.amountPaise, reason: p.reason || "manual_credit", actorId: actor.actorId, actorRole: actor.actorRole })
    : await adminDebit({ userId: id, amountPaise: p.amountPaise, reason: p.reason || "manual_debit", actorId: actor.actorId, actorRole: actor.actorRole }).catch((e) => { throw Errors.badRequest((e as Error).message); });
  await logCustomerEvent(db, id, "WALLET", `Wallet ${p.direction === "credit" ? "credited" : "debited"} ₹${Math.round(p.amountPaise / 100)}${p.reason ? ` — ${p.reason}` : ""}`, { direction: p.direction, amountPaise: p.amountPaise, reason: p.reason, reference: res.txn.reference }, actor);
  return { id, balancePaise: res.balancePaise, reference: res.txn.reference };
}

export async function addNote(id: string, body: string, actor: Actor) {
  await ensureCustomer(id);
  await db.$transaction(async (tx) => {
    await tx.customerNote.create({ data: { userId: id, body, byId: actor.actorId, byRole: actor.actorRole } });
    await logCustomerEvent(tx, id, "NOTE", "Internal note added", { body }, actor);
  });
  return { id };
}

export interface PrefArgs { emailOptIn?: boolean; smsOptIn?: boolean; whatsappOptIn?: boolean; pushOptIn?: boolean; marketingOptIn?: boolean; language?: string; preferredSlot?: string | null }

export async function setPreferences(id: string, prefs: PrefArgs, actor: Actor) {
  await ensureCustomer(id);
  await db.customerPreference.upsert({ where: { userId: id }, create: { userId: id, ...prefs }, update: prefs });
  await logCustomerEvent(db, id, "PREFERENCE", "Preferences updated", prefs, actor);
  return { id };
}

// ---- address management ----
export interface AddrArgs { label?: string; line1: string; line2?: string; city: string; pincode: string; lat?: number; lng?: number; deliveryNote?: string; isDefault?: boolean }

async function resolvePincode(pincode: string) {
  const sp = await db.serviceablePincode.findUnique({ where: { pincode }, select: { zoneId: true, enabled: true } });
  return { zoneId: sp?.zoneId ?? null, serviceable: !!sp?.enabled };
}

export async function addAddress(id: string, a: AddrArgs, actor: Actor) {
  await ensureCustomer(id);
  const { zoneId, serviceable } = await resolvePincode(a.pincode);
  const addr = await db.$transaction(async (tx) => {
    if (a.isDefault) await tx.address.updateMany({ where: { userId: id }, data: { isDefault: false } });
    const created = await tx.address.create({ data: { userId: id, label: a.label ?? "Home", line1: a.line1, line2: a.line2, city: a.city, pincode: a.pincode, lat: a.lat, lng: a.lng, deliveryNote: a.deliveryNote, isDefault: a.isDefault ?? false, zoneId } });
    await logCustomerEvent(tx, id, "ADDRESS", `Address added (${a.pincode}${serviceable ? "" : " — not serviceable"})`, { pincode: a.pincode, serviceable }, actor);
    return created;
  });
  return { id: addr.id, serviceable };
}

export async function updateAddress(id: string, addressId: string, a: Partial<AddrArgs>, actor: Actor) {
  await ensureCustomer(id);
  const existing = await db.address.findFirst({ where: { id: addressId, userId: id }, select: { id: true } });
  if (!existing) throw Errors.notFound("Address not found.");
  let zoneId: string | undefined; let serviceable = true;
  if (a.pincode) { const r = await resolvePincode(a.pincode); zoneId = r.zoneId ?? undefined; serviceable = r.serviceable; }
  await db.$transaction(async (tx) => {
    if (a.isDefault) await tx.address.updateMany({ where: { userId: id }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addressId }, data: { ...a, ...(zoneId !== undefined ? { zoneId } : {}) } });
    await logCustomerEvent(tx, id, "ADDRESS", "Address updated", { addressId, serviceable }, actor);
  });
  return { id: addressId, serviceable };
}

export async function deleteAddress(id: string, addressId: string, actor: Actor) {
  await ensureCustomer(id);
  const existing = await db.address.findFirst({ where: { id: addressId, userId: id }, select: { id: true, subscriptions: { take: 1, select: { id: true } } } });
  if (!existing) throw Errors.notFound("Address not found.");
  if (existing.subscriptions.length) throw Errors.conflict("This address is used by a subscription and cannot be deleted.");
  await db.address.delete({ where: { id: addressId } });
  await logCustomerEvent(db, id, "ADDRESS", "Address deleted", { addressId }, actor);
  return { id: addressId };
}

export async function setDefaultAddress(id: string, addressId: string, actor: Actor) {
  await ensureCustomer(id);
  const existing = await db.address.findFirst({ where: { id: addressId, userId: id }, select: { id: true } });
  if (!existing) throw Errors.notFound("Address not found.");
  await db.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { userId: id }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    await logCustomerEvent(tx, id, "ADDRESS", "Default address changed", { addressId }, actor);
  });
  return { id: addressId };
}

export async function assignExecutive(id: string, executive: string, actor: Actor) {
  await ensureCustomer(id);
  await db.customerPreference.upsert({ where: { userId: id }, create: { userId: id, assignedExecutive: executive }, update: { assignedExecutive: executive } });
  await logCustomerEvent(db, id, "UPDATED", `Delivery executive assigned: ${executive}`, { assignedExecutive: executive }, actor);
  return { id };
}

// ---------------------------------------------------------------- bulk

export interface BulkArgs { ids: string[]; action: string; executive?: string; title?: string; body?: string; channel?: string }

export async function bulkAction(args: BulkArgs, actor: Actor) {
  const ids = [...new Set(args.ids)].slice(0, 500);
  const valid = await db.user.findMany({ where: { id: { in: ids }, role: "CUSTOMER" }, select: { id: true } });
  const validIds = valid.map((v) => v.id);
  if (!validIds.length) throw Errors.badRequest("No valid customers selected.");

  if (args.action === "activate" || args.action === "deactivate") {
    const status = args.action === "activate" ? "ACTIVE" : "DISABLED";
    await db.user.updateMany({ where: { id: { in: validIds } }, data: { status } });
    await db.customerEvent.createMany({ data: validIds.map((userId) => ({ userId, type: "STATUS", summary: `Account ${args.action === "activate" ? "activated" : "deactivated"} (bulk)`, byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  if (args.action === "assign-exec") {
    if (!args.executive?.trim()) throw Errors.badRequest("Provide a delivery executive name.");
    for (const userId of validIds) await db.customerPreference.upsert({ where: { userId }, create: { userId, assignedExecutive: args.executive }, update: { assignedExecutive: args.executive } });
    await db.customerEvent.createMany({ data: validIds.map((userId) => ({ userId, type: "UPDATED", summary: `Delivery executive assigned: ${args.executive} (bulk)`, byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  if (args.action === "notify") {
    if (!args.title?.trim() || !args.body?.trim()) throw Errors.badRequest("Provide a title and message.");
    const channel = (["SMS", "WHATSAPP", "PUSH", "EMAIL"].includes(args.channel ?? "") ? args.channel : "PUSH") as "SMS" | "WHATSAPP" | "PUSH" | "EMAIL";
    await db.notification.createMany({ data: validIds.map((userId) => ({ userId, channel, title: args.title!, body: args.body!, sentAt: new Date() })) });
    await db.customerEvent.createMany({ data: validIds.map((userId) => ({ userId, type: "NOTIFY", summary: `${channel} notification sent: ${args.title}`, byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action, channel };
  }
  if (args.action === "export") {
    await db.customerEvent.createMany({ data: validIds.map((userId) => ({ userId, type: "EXPORT", summary: "Customer data exported (bulk)", byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  throw Errors.badRequest("Unknown bulk action.");
}

// ---------------------------------------------------------------- reports

export async function customerReports(args: { dateFrom?: string; dateTo?: string } = {}): Promise<CustomerReports> {
  const now = new Date();
  const where: Prisma.UserWhereInput = { role: "CUSTOMER", deletedAt: null };
  if (args.dateFrom || args.dateTo) {
    const r: Prisma.DateTimeFilter = {};
    if (args.dateFrom) r.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) r.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    where.createdAt = r;
  }

  const customers = await db.user.findMany({
    where,
    include: {
      addresses: { where: { isDefault: true }, take: 1, select: { pincode: true, zone: { select: { name: true } } } },
      subscriptions: { select: { status: true, plan: { select: { name: true } } } },
      orders: { select: { type: true, status: true, totalPaise: true, createdAt: true } },
      _count: { select: { referrals: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const growthMap = new Map<string, number>();
  let active = 0, inactive = 0, trials = 0, converted = 0, subActive = 0, subPaused = 0, subCancelled = 0;
  let withRepeat = 0, oneTime = 0, referrers = 0;
  const revenue: CustomerReports["revenueByCustomer"] = [];
  const rows: CustomerReports["rows"] = [];

  for (const c of customers) {
    const m = c.createdAt.toISOString().slice(0, 7);
    growthMap.set(m, (growthMap.get(m) ?? 0) + 1);
    if (c.status === "ACTIVE") active++; else inactive++;
    const hasTrial = c.orders.some((o) => o.type === "SAMPLE");
    const hasActiveSub = c.subscriptions.some((s) => s.status === "ACTIVE");
    if (hasTrial) { trials++; if (hasActiveSub) converted++; }
    subActive += c.subscriptions.filter((s) => s.status === "ACTIVE").length;
    subPaused += c.subscriptions.filter((s) => s.status === "PAUSED" || s.status === "VACATION").length;
    subCancelled += c.subscriptions.filter((s) => s.status === "CANCELLED").length;
    const paidOrders = c.orders.filter((o) => o.status === "PAID");
    if (paidOrders.length > 1) withRepeat++; else if (paidOrders.length === 1) oneTime++;
    if (c._count.referrals > 0) referrers++;
    const rev = paidOrders.reduce((s, o) => s + o.totalPaise, 0);
    if (rev > 0) revenue.push({ id: c.id, name: c.name, phone: c.phone, orders: paidOrders.length, revenuePaise: rev });
    rows.push({
      shortId: shortId(c.id), name: c.name ?? "—", phone: c.phone ?? "", email: c.email ?? "",
      type: deriveType(hasActiveSub, hasTrial, c.orders.length), status: c.status,
      plan: c.subscriptions.find((s) => s.status === "ACTIVE")?.plan.name ?? "—",
      walletRupees: Math.round(c.walletPaise / 100), orders: c.orders.length,
      registered: c.createdAt.toISOString().slice(0, 10), pincode: c.addresses[0]?.pincode ?? "", zone: c.addresses[0]?.zone?.name ?? "",
    });
  }

  const [invited, convertedInvites, cashbackAgg, referralAgg, walletOutstanding] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER", referredById: { not: null } } }),
    db.user.count({ where: { role: "CUSTOMER", referredById: { not: null }, orders: { some: { status: "PAID" } } } }),
    db.walletTxn.aggregate({ where: { kind: "cashback", type: "CREDIT" }, _sum: { amountPaise: true } }),
    db.walletTxn.aggregate({ where: { kind: "referral", type: "CREDIT" }, _sum: { amountPaise: true } }),
    db.user.aggregate({ where: { role: "CUSTOMER" }, _sum: { walletPaise: true } }),
  ]);

  revenue.sort((a, b) => b.revenuePaise - a.revenuePaise);
  const total = customers.length;
  return {
    growth: [...growthMap].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count })),
    active: { active, inactive, total },
    retention: { withRepeatOrders: withRepeat, oneTime, rate: withRepeat + oneTime ? Math.round((withRepeat / (withRepeat + oneTime)) * 1000) / 10 : 0 },
    trial: { trials, converted, rate: trials ? Math.round((converted / trials) * 1000) / 10 : 0 },
    subscription: { active: subActive, paused: subPaused, cancelled: subCancelled },
    referral: { referrers, invited, converted: convertedInvites },
    wallet: { outstandingPaise: walletOutstanding._sum.walletPaise ?? 0, cashbackPaise: cashbackAgg._sum.amountPaise ?? 0, referralPaise: referralAgg._sum.amountPaise ?? 0 },
    revenueByCustomer: revenue.slice(0, 20),
    rows,
  };
}

// ---------------------------------------------------------------- options (delivery executives for assign)

export async function deliveryExecutives() {
  const drivers = await db.driver.findMany({ where: { active: true }, select: { user: { select: { name: true } }, employeeId: true } });
  return { executives: drivers.map((d) => d.user.name ?? d.employeeId ?? "—").filter(Boolean) };
}
