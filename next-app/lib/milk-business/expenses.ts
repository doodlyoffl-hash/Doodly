/* PRIVATE Milk-Business expenses — a milk-SCOPED lens over the existing Daily
   Expense engine (lib/expenses). Milk-business expenses live in dedicated expense
   categories identified by the slug prefix `milk-business-`, so the private P&L can
   count ONLY milk expenses (separate from the general/retail expenses that the
   public Daily Expenses page books). No schema change — categories are data; we
   just seed a milk-scoped set and filter by their slug prefix.

   Creating an expense here reuses lib/expenses/service.createExpense unchanged
   (same validation, code, audit, approval workflow) — no duplicated logic. */
import "server-only";
import { db } from "@/lib/db";
import { createExpense, listExpenses } from "@/lib/expenses/service";

export const MILK_EXPENSE_SLUG_PREFIX = "milk-business-";

// Seed set of milk cost-centre categories. Slugs are set EXPLICITLY (not via
// slugifyCategory) so the `milk-business-` prefix is guaranteed and never collides
// with the default "Milk Procurement" (slug `milk-procurement`).
export const MILK_EXPENSE_CATEGORIES: Array<{ slug: string; name: string }> = [
  { slug: "milk-business-feed", name: "Milk Business · Feed & Fodder" },
  { slug: "milk-business-transport", name: "Milk Business · Transport & Diesel" },
  { slug: "milk-business-labour", name: "Milk Business · Labour & Wages" },
  { slug: "milk-business-maintenance", name: "Milk Business · Maintenance & Equipment" },
  { slug: "milk-business-utilities", name: "Milk Business · Utilities" },
  { slug: "milk-business-procurement", name: "Milk Business · Procurement (non-tanker)" },
  { slug: "milk-business-other", name: "Milk Business · Other" },
];

/** Idempotently ensure the milk cost-centre categories exist (safe to call anytime).
 *  Upserts by unique slug, so it never duplicates and never touches other categories. */
export async function ensureMilkExpenseCategories() {
  const base = await db.expenseCategory.aggregate({ _max: { sortOrder: true } });
  let sort = (base._max.sortOrder ?? 0) + 1;
  for (const c of MILK_EXPENSE_CATEGORIES) {
    await db.expenseCategory.upsert({
      where: { slug: c.slug },
      create: { name: c.name, slug: c.slug, sortOrder: sort++, active: true },
      update: {}, // never clobber an admin's rename / sortOrder / active toggle
    });
  }
}

/** The milk-scoped categories (active), seeding them first. For the private form. */
export async function listMilkExpenseCategories() {
  await ensureMilkExpenseCategories();
  return db.expenseCategory.findMany({
    where: { deletedAt: null, active: true, slug: { startsWith: MILK_EXPENSE_SLUG_PREFIX } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });
}

/** IDs of the milk-scoped categories (no seeding — the P&L just needs to filter;
 *  if none exist yet there simply are no milk expenses to subtract). */
export async function milkExpenseCategoryIds(): Promise<string[]> {
  const rows = await db.expenseCategory.findMany({ where: { deletedAt: null, slug: { startsWith: MILK_EXPENSE_SLUG_PREFIX } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Record a milk-business expense: enforce the category is a milk one, then reuse the
 *  existing Daily Expense engine (createExpense). Counts in the private P&L immediately. */
export async function createMilkExpense(raw: Record<string, unknown>, actor: { actorId?: string; actorName?: string; actorRole?: string }) {
  const categoryId = String(raw.categoryId ?? "");
  const cat = categoryId ? await db.expenseCategory.findUnique({ where: { id: categoryId }, select: { slug: true, deletedAt: true } }) : null;
  if (!cat || cat.deletedAt || !cat.slug.startsWith(MILK_EXPENSE_SLUG_PREFIX)) {
    throw new Error("Pick a Milk Business expense category.");
  }
  return createExpense(raw, actor);
}

/** Recent milk-business expenses in a date range (for the private list). */
export async function listMilkExpenses(from?: string, to?: string, limit = 50) {
  const ids = await milkExpenseCategoryIds();
  if (!ids.length) return [];
  const rows = await listExpenses({ from, to, limit });
  return rows.filter((e) => ids.includes(e.categoryId));
}
