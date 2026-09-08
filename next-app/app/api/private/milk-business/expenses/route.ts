/* /api/private/milk-business/expenses — MILK-SCOPED expenses for the private module.
   Wraps the EXISTING Daily Expense engine (lib/milk-business/expenses → createExpense),
   but constrained to the milk cost-centre categories (slug `milk-business-*`) and gated
   on the milkBusiness RBAC module — so accountant/operations can record milk expenses
   from the private console, and only those feed the private P&L. No duplicated logic. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listMilkExpenseCategories, listMilkExpenses, createMilkExpense } from "@/lib/milk-business/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "categories";
  try {
    if (view === "categories") return NextResponse.json({ ok: true, categories: await listMilkExpenseCategories() }, { headers: { "Cache-Control": "no-store" } });
    if (view === "list") return NextResponse.json({ ok: true, expenses: await listMilkExpenses(sp.get("from") ?? undefined, sp.get("to") ?? undefined) }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) {
    console.error("mb.expenses.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load expenses." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = requireMilkBusiness(req, "create");
  if (!g.ok) return g.res;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (String(body.action ?? "") !== "create") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    const expense = await createMilkExpense(body, { actorId: g.userId, actorRole: g.role });
    return NextResponse.json({ ok: true, expense });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Couldn't save the expense." }, { status: 400 });
  }
}
