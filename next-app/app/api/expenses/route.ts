/* /api/expenses — Finance → Daily Expenses. Accountant / Admin / Super-Admin.
   GET   ?from&to&preset&categoryId&paymentMode&status&vendor&createdById&min&max&q
   POST  { ...expense }   — create (auto Expense ID, starts Pending Approval) */
import { NextRequest, NextResponse } from "next/server";
import { listExpenses, createExpense } from "@/lib/expenses/service";
import { resolveDatePreset, type DatePreset, type ExpenseStatus } from "@/lib/expenses/engine";
import { actorRole, actorId, actorName, canUseExpenses } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rupeesToPaise = (v: string | null) => (v != null && v !== "" ? Math.round(Number(v) * 100) : undefined);

export async function GET(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const preset = sp.get("preset") as DatePreset | null;
    const range = preset ? resolveDatePreset(preset) : {};
    const expenses = await listExpenses({
      from: sp.get("from") ?? range.from,
      to: sp.get("to") ?? range.to,
      categoryId: sp.get("categoryId") ?? undefined,
      paymentMode: sp.get("paymentMode") ?? undefined,
      status: (sp.get("status") as ExpenseStatus) ?? undefined,
      vendor: sp.get("vendor") ?? undefined,
      createdById: sp.get("createdById") ?? undefined,
      minPaise: rupeesToPaise(sp.get("min")),
      maxPaise: rupeesToPaise(sp.get("max")),
      q: sp.get("q") ?? undefined,
    });
    return NextResponse.json({ expenses }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expenses.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load expenses." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const expense = await createExpense(json, { actorId: actorId(req), actorName: actorName(req) });
    return NextResponse.json({ ok: true, expense }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create expense" }, { status: 409 });
  }
}
