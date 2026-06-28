/* =============================================================
   Daily Expense Management — service layer (Prisma, server-only).
   Atomic per-day IDs via Counter; ERP approval workflow with a full
   audit trail; partial payments; categories; dashboard + reports.
   Admin / Accountant / Super-Admin only (enforced at the API layer;
   approval/settings further gated there).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ExpenseSchema, CategorySchema, PaymentSchema } from "./validation";
import {
  formatExpenseCode, toYmd, computeExpenseTotal, deriveExpensePaymentStatus,
  canTransitionExpenseStatus, EXPENSE_STATUS_LABEL, DEFAULT_EXPENSE_CATEGORIES, slugifyCategory,
  type ExpenseStatus,
} from "./engine";

interface Actor { actorId?: string; actorName?: string; actorRole?: string }

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      if (code === "P2034" || code === "P2037" || code === "P2002") { await sleep(40 * (i + 1)); continue; }
      throw e;
    }
  }
  throw last;
}

async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

async function logAudit(
  tx: Prisma.TransactionClient, expenseId: string, action: string,
  opts: { detail?: string; fromStatus?: string; toStatus?: string } & Actor,
) {
  await tx.expenseAuditLog.create({
    data: {
      expenseId, action, detail: opts.detail ?? null,
      fromStatus: opts.fromStatus ?? null, toStatus: opts.toStatus ?? null,
      actorId: opts.actorId ?? null, actorName: opts.actorName ?? null,
    },
  });
}

// ---------- categories ----------

/** Seed the default categories once (idempotent). Safe to call before any list. */
export async function ensureDefaultCategories() {
  const count = await db.expenseCategory.count();
  if (count > 0) return;
  await db.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ name, slug: slugifyCategory(name), sortOrder: i })),
    skipDuplicates: true,
  });
}

export async function listCategories(opts: { includeInactive?: boolean } = {}) {
  await ensureDefaultCategories();
  return db.expenseCategory.findMany({
    where: { deletedAt: null, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(raw: unknown) {
  const data = CategorySchema.parse(raw);
  const max = await db.expenseCategory.aggregate({ _max: { sortOrder: true } });
  return db.expenseCategory.create({
    data: { name: data.name, slug: slugifyCategory(data.name), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
}

export async function updateCategory(id: string, raw: unknown) {
  const data = CategorySchema.partial().parse(raw);
  const patch: Prisma.ExpenseCategoryUpdateInput = {};
  if (data.name !== undefined) { patch.name = data.name; patch.slug = slugifyCategory(data.name); }
  if (data.active !== undefined) patch.active = data.active;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
  return db.expenseCategory.update({ where: { id }, data: patch });
}

/** Soft delete a category. Blocked while it still has (non-deleted) expenses. */
export async function deleteCategory(id: string) {
  const inUse = await db.expense.count({ where: { categoryId: id, deletedAt: null } });
  if (inUse > 0) throw new Error(`Category is used by ${inUse} expense(s); disable it instead of deleting.`);
  return db.expenseCategory.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
}

// ---------- expenses ----------

export async function createExpense(raw: unknown, actor: Actor) {
  const data = ExpenseSchema.parse(raw);
  const totals = computeExpenseTotal({ amountPaise: data.amountPaise, gstIncluded: data.gstIncluded, gstPaise: data.gstPaise });
  const ymd = toYmd(data.date);

  return withRetry(() =>
    db.$transaction(async (tx) => {
      const cat = await tx.expenseCategory.findUnique({ where: { id: data.categoryId }, select: { id: true, deletedAt: true } });
      if (!cat || cat.deletedAt) throw new Error("Category not found");

      const code = formatExpenseCode(ymd, await nextSeq(tx, `expense:${ymd}`));
      const expense = await tx.expense.create({
        data: {
          code, date: new Date(data.date), title: data.title, categoryId: data.categoryId,
          description: clean(data.description), vendor: clean(data.vendor), invoiceNo: clean(data.invoiceNo),
          paymentMode: data.paymentMode, amountPaise: totals.amountPaise, gstIncluded: data.gstIncluded,
          gstPaise: totals.gstPaise, totalPaise: totals.totalPaise, status: "PENDING_APPROVAL",
          requestedBy: clean(data.requestedBy) ?? actor.actorName ?? null, approvedBy: clean(data.approvedBy),
          paidBy: clean(data.paidBy), createdById: actor.actorId, notes: clean(data.notes),
          attachments: data.attachments?.length
            ? { create: data.attachments.map((a) => ({ name: a.name, kind: a.kind, url: clean(a.url), mime: clean(a.mime), sizeBytes: a.sizeBytes, uploadedById: actor.actorId })) }
            : undefined,
        },
        include: { category: true, attachments: true },
      });
      await logAudit(tx, expense.id, "created", { detail: `Created ${expense.code}`, toStatus: "PENDING_APPROVAL", ...actor });
      return expense;
    }, TX),
  );
}

export interface ExpenseFilters {
  from?: string; to?: string; categoryId?: string; paymentMode?: string; status?: ExpenseStatus;
  vendor?: string; createdById?: string; minPaise?: number; maxPaise?: number; q?: string; limit?: number;
}

function buildWhere(f: ExpenseFilters): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { deletedAt: null };
  if (f.from || f.to) {
    where.date = {};
    if (f.from) where.date.gte = new Date(f.from);
    if (f.to) { const t = new Date(f.to); t.setHours(23, 59, 59, 999); where.date.lte = t; }
  }
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.paymentMode) where.paymentMode = f.paymentMode as Prisma.ExpenseWhereInput["paymentMode"];
  if (f.status) where.status = f.status;
  if (f.createdById) where.createdById = f.createdById;
  if (f.minPaise != null || f.maxPaise != null) {
    where.totalPaise = {};
    if (f.minPaise != null) where.totalPaise.gte = f.minPaise;
    if (f.maxPaise != null) where.totalPaise.lte = f.maxPaise;
  }
  const and: Prisma.ExpenseWhereInput[] = [];
  if (f.vendor?.trim()) and.push({ vendor: { contains: f.vendor.trim(), mode: "insensitive" } });
  if (f.q?.trim()) {
    const s = f.q.trim();
    and.push({ OR: [
      { code: { contains: s, mode: "insensitive" } },
      { title: { contains: s, mode: "insensitive" } },
      { vendor: { contains: s, mode: "insensitive" } },
      { description: { contains: s, mode: "insensitive" } },
      { category: { name: { contains: s, mode: "insensitive" } } },
    ] });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function listExpenses(f: ExpenseFilters = {}) {
  return db.expense.findMany({
    where: buildWhere(f), orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: f.limit ?? 300,
    include: { category: { select: { name: true } }, _count: { select: { attachments: true } } },
  });
}

export async function getExpense(id: string) {
  return db.expense.findUnique({
    where: { id },
    include: {
      category: true,
      attachments: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function updateExpense(id: string, raw: unknown, actor: Actor) {
  const data = ExpenseSchema.partial().parse(raw);
  return db.$transaction(async (tx) => {
    const cur = await tx.expense.findUnique({ where: { id }, select: { status: true, amountPaise: true, gstIncluded: true, gstPaise: true } });
    if (!cur) throw new Error("Expense not found");
    if (cur.status === "PAID" || cur.status === "CANCELLED" || cur.status === "REJECTED") {
      throw new Error(`A ${EXPENSE_STATUS_LABEL[cur.status as ExpenseStatus]} expense can no longer be edited.`);
    }
    const patch: Prisma.ExpenseUpdateInput = {};
    if (data.date !== undefined) patch.date = new Date(data.date);
    if (data.title !== undefined) patch.title = data.title;
    if (data.categoryId !== undefined) patch.category = { connect: { id: data.categoryId } };
    if (data.description !== undefined) patch.description = clean(data.description);
    if (data.vendor !== undefined) patch.vendor = clean(data.vendor);
    if (data.invoiceNo !== undefined) patch.invoiceNo = clean(data.invoiceNo);
    if (data.paymentMode !== undefined) patch.paymentMode = data.paymentMode;
    if (data.requestedBy !== undefined) patch.requestedBy = clean(data.requestedBy);
    if (data.approvedBy !== undefined) patch.approvedBy = clean(data.approvedBy);
    if (data.paidBy !== undefined) patch.paidBy = clean(data.paidBy);
    if (data.notes !== undefined) patch.notes = clean(data.notes);

    const amountPaise = data.amountPaise ?? cur.amountPaise;
    const gstIncluded = data.gstIncluded ?? cur.gstIncluded;
    const gstPaise = data.gstPaise ?? cur.gstPaise;
    if (data.amountPaise !== undefined || data.gstIncluded !== undefined || data.gstPaise !== undefined) {
      const t = computeExpenseTotal({ amountPaise, gstIncluded, gstPaise });
      patch.amountPaise = t.amountPaise; patch.gstIncluded = gstIncluded; patch.gstPaise = t.gstPaise; patch.totalPaise = t.totalPaise;
    }
    const updated = await tx.expense.update({ where: { id }, data: patch });
    await logAudit(tx, id, "updated", { detail: "Expense details updated", ...actor });
    return updated;
  }, TX);
}

async function transition(id: string, to: ExpenseStatus, action: string, actor: Actor, extra: Prisma.ExpenseUpdateInput = {}, detail?: string) {
  return db.$transaction(async (tx) => {
    const cur = await tx.expense.findUnique({ where: { id }, select: { status: true } });
    if (!cur) throw new Error("Expense not found");
    const from = cur.status as ExpenseStatus;
    if (from !== to && !canTransitionExpenseStatus(from, to)) {
      throw new Error(`Cannot move from ${EXPENSE_STATUS_LABEL[from]} to ${EXPENSE_STATUS_LABEL[to]}`);
    }
    const updated = await tx.expense.update({ where: { id }, data: { status: to, ...extra } });
    await logAudit(tx, id, action, { fromStatus: from, toStatus: to, detail, ...actor });
    return updated;
  }, TX);
}

export const approveExpense = (id: string, actor: Actor) =>
  transition(id, "APPROVED", "approved", actor, { approvedAt: new Date(), approvedBy: actor.actorName ?? undefined }, "Expense approved");

export const rejectExpense = (id: string, actor: Actor, reason?: string) =>
  transition(id, "REJECTED", "rejected", actor, {}, reason ? `Rejected: ${reason}` : "Expense rejected");

export const cancelExpense = (id: string, actor: Actor) =>
  transition(id, "CANCELLED", "cancelled", actor, {}, "Expense cancelled");

/** Record a (possibly partial) payment. Requires an APPROVED / PARTIALLY_PAID expense. */
export async function recordExpensePayment(id: string, raw: unknown, actor: Actor) {
  const data = PaymentSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const exp = await tx.expense.findUnique({ where: { id }, select: { status: true, totalPaise: true, paidPaise: true } });
    if (!exp) throw new Error("Expense not found");
    if (exp.status !== "APPROVED" && exp.status !== "PARTIALLY_PAID") {
      throw new Error("Expense must be approved before recording a payment.");
    }
    await tx.expensePayment.create({
      data: { expenseId: id, amountPaise: data.amountPaise, mode: data.mode, reference: clean(data.reference), note: clean(data.note), paidBy: clean(data.paidBy) ?? actor.actorName ?? null, recordedById: actor.actorId },
    });
    const paidPaise = exp.paidPaise + data.amountPaise;
    const next = deriveExpensePaymentStatus(exp.totalPaise, paidPaise) as ExpenseStatus;
    const updated = await tx.expense.update({
      where: { id },
      data: { paidPaise, status: next, paidBy: clean(data.paidBy) ?? actor.actorName ?? undefined, ...(next === "PAID" ? { paidAt: new Date() } : {}) },
    });
    await logAudit(tx, id, next === "PAID" ? "paid" : "partially_paid", {
      fromStatus: exp.status, toStatus: next, detail: `Payment recorded (${data.mode})`, ...actor,
    });
    return updated;
  }, TX);
}

/** Convenience: settle the full outstanding amount in one go. */
export async function markExpensePaid(id: string, actor: Actor) {
  const exp = await db.expense.findUnique({ where: { id }, select: { totalPaise: true, paidPaise: true, paymentMode: true, status: true } });
  if (!exp) throw new Error("Expense not found");
  const outstanding = exp.totalPaise - exp.paidPaise;
  if (outstanding <= 0) throw new Error("Nothing outstanding on this expense.");
  return recordExpensePayment(id, { amountPaise: outstanding, mode: exp.paymentMode }, actor);
}

export async function addAttachments(id: string, attachments: { name: string; kind: string; url?: string; mime?: string; sizeBytes?: number }[], actor: Actor) {
  await db.expenseAttachment.createMany({
    data: attachments.map((a) => ({ expenseId: id, name: a.name, kind: a.kind, url: a.url ?? null, mime: a.mime ?? null, sizeBytes: a.sizeBytes ?? 0, uploadedById: actor.actorId })),
  });
  return getExpense(id);
}

export async function softDeleteExpense(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit(tx, id, "deleted", { detail: "Expense soft-deleted", ...actor });
    return { ok: true };
  }, TX);
}

// ---------- dashboard ----------

const SPEND_WHERE: Prisma.ExpenseWhereInput = { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } };
const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export async function expenseDashboard(now = new Date()) {
  const today = dayStart(now);
  const weekStart = dayStart(now); weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendFrom = dayStart(now); trendFrom.setDate(trendFrom.getDate() - 13);          // 14-day daily trend
  const monthsFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);                  // 6-month trend

  const sumTotal = (where: Prisma.ExpenseWhereInput) =>
    db.expense.aggregate({ where: { ...SPEND_WHERE, ...where }, _sum: { totalPaise: true }, _count: true });

  const [todayAgg, weekAgg, monthAgg, pending, paidAgg, outstandingAgg, byCategory, byMode, trendRows] = await Promise.all([
    sumTotal({ date: { gte: today } }),
    sumTotal({ date: { gte: weekStart } }),
    sumTotal({ date: { gte: monthStart } }),
    db.expense.count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } }),
    db.expense.aggregate({ where: SPEND_WHERE, _sum: { paidPaise: true } }),
    db.expense.aggregate({ where: { deletedAt: null, status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, _sum: { totalPaise: true, paidPaise: true } }),
    db.expense.groupBy({ by: ["categoryId"], where: { ...SPEND_WHERE, date: { gte: monthStart } }, _sum: { totalPaise: true }, orderBy: { _sum: { totalPaise: "desc" } } }),
    db.expense.groupBy({ by: ["paymentMode"], where: { ...SPEND_WHERE, date: { gte: monthStart } }, _sum: { totalPaise: true } }),
    db.expense.findMany({ where: { ...SPEND_WHERE, date: { gte: monthsFrom } }, select: { date: true, totalPaise: true } }),
  ]);

  // resolve category names
  const catIds = byCategory.map((c) => c.categoryId);
  const cats = catIds.length ? await db.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  // daily buckets (last 14d)
  const daily: { date: string; totalPaise: number }[] = [];
  for (let i = 0; i < 14; i++) { const d = new Date(trendFrom); d.setDate(d.getDate() + i); daily.push({ date: d.toISOString().slice(0, 10), totalPaise: 0 }); }
  const dailyIdx = new Map(daily.map((d, i) => [d.date, i]));
  // monthly buckets (last 6m)
  const monthly: { month: string; totalPaise: number }[] = [];
  for (let i = 0; i < 6; i++) { const d = new Date(monthsFrom.getFullYear(), monthsFrom.getMonth() + i, 1); monthly.push({ month: d.toISOString().slice(0, 7), totalPaise: 0 }); }
  const monthlyIdx = new Map(monthly.map((m, i) => [m.month, i]));

  for (const r of trendRows) {
    const dKey = r.date.toISOString().slice(0, 10);
    const di = dailyIdx.get(dKey); if (di != null) daily[di].totalPaise += r.totalPaise;
    const mKey = r.date.toISOString().slice(0, 7);
    const mi = monthlyIdx.get(mKey); if (mi != null) monthly[mi].totalPaise += r.totalPaise;
  }

  return {
    cards: {
      todayPaise: todayAgg._sum.totalPaise ?? 0, todayCount: todayAgg._count,
      weekPaise: weekAgg._sum.totalPaise ?? 0,
      monthPaise: monthAgg._sum.totalPaise ?? 0, monthCount: monthAgg._count,
      pendingApprovals: pending,
      paidPaise: paidAgg._sum.paidPaise ?? 0,
      outstandingPaise: (outstandingAgg._sum.totalPaise ?? 0) - (outstandingAgg._sum.paidPaise ?? 0),
    },
    categoryBreakdown: byCategory.map((c) => ({ name: catName.get(c.categoryId) ?? "—", totalPaise: c._sum.totalPaise ?? 0 })),
    paymentModeBreakdown: byMode.map((m) => ({ mode: m.paymentMode, totalPaise: m._sum.totalPaise ?? 0 })),
    dailyTrend: daily,
    monthlyTrend: monthly,
  };
}

// ---------- reports ----------

export async function expenseReports(f: ExpenseFilters = {}) {
  const where = buildWhere({ ...f });
  const spendWhere: Prisma.ExpenseWhereInput = { AND: [where, { status: { notIn: ["REJECTED", "CANCELLED"] } }] };

  const [totals, byCategory, byMode, outstanding, gstAgg, vendorRows] = await Promise.all([
    db.expense.aggregate({ where: spendWhere, _count: true, _sum: { totalPaise: true, paidPaise: true, gstPaise: true } }),
    db.expense.groupBy({ by: ["categoryId"], where: spendWhere, _count: true, _sum: { totalPaise: true }, orderBy: { _sum: { totalPaise: "desc" } } }),
    db.expense.groupBy({ by: ["paymentMode"], where: spendWhere, _count: true, _sum: { totalPaise: true } }),
    db.expense.findMany({ where: { AND: [where, { status: { in: ["APPROVED", "PARTIALLY_PAID"] } }] }, select: { id: true, code: true, title: true, vendor: true, totalPaise: true, paidPaise: true, date: true }, orderBy: { date: "asc" } }),
    db.expense.aggregate({ where: { AND: [spendWhere, { gstPaise: { gt: 0 } }] }, _sum: { gstPaise: true, totalPaise: true }, _count: true }),
    db.expense.groupBy({ by: ["vendor"], where: { AND: [spendWhere, { vendor: { not: null } }] }, _count: true, _sum: { totalPaise: true }, orderBy: { _sum: { totalPaise: "desc" } }, take: 20 }),
  ]);

  const catIds = byCategory.map((c) => c.categoryId);
  const cats = catIds.length ? await db.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return {
    totals: {
      count: totals._count, totalPaise: totals._sum.totalPaise ?? 0,
      paidPaise: totals._sum.paidPaise ?? 0,
      outstandingPaise: (totals._sum.totalPaise ?? 0) - (totals._sum.paidPaise ?? 0),
      gstPaise: totals._sum.gstPaise ?? 0,
    },
    byCategory: byCategory.map((c) => ({ name: catName.get(c.categoryId) ?? "—", count: c._count, totalPaise: c._sum.totalPaise ?? 0 })),
    byPaymentMode: byMode.map((m) => ({ mode: m.paymentMode, count: m._count, totalPaise: m._sum.totalPaise ?? 0 })),
    byVendor: vendorRows.map((v) => ({ vendor: v.vendor ?? "—", count: v._count, totalPaise: v._sum.totalPaise ?? 0 })),
    outstanding: outstanding.map((o) => ({ ...o, date: o.date, outstandingPaise: o.totalPaise - o.paidPaise })),
    gst: { count: gstAgg._count, gstPaise: gstAgg._sum.gstPaise ?? 0, totalPaise: gstAgg._sum.totalPaise ?? 0 },
  };
}

// ---------- staff lookup (for Requested / Approved / Paid By pickers) ----------

/** Active, non-customer users — the staff who can be referenced on an expense. */
export async function listStaffUsers() {
  return db.user.findMany({
    where: { deletedAt: null, status: "ACTIVE", role: { notIn: ["CUSTOMER", "DELIVERY_EXECUTIVE"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" }, take: 200,
  });
}

export type ExpenseDashboard = Awaited<ReturnType<typeof expenseDashboard>>;
export type ExpenseReports = Awaited<ReturnType<typeof expenseReports>>;
