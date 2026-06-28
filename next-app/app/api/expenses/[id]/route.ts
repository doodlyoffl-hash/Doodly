/* /api/expenses/[id] — Accountant / Admin / Super-Admin.
   GET                                   — full expense (attachments, payments, audit)
   PATCH { action: "update"|"approve"|"reject"|"pay"|"markPaid"|"cancel"|"attach"|"delete", ... }
        approve/reject/cancel/delete are Admin / Super-Admin only. */
import { NextRequest, NextResponse } from "next/server";
import {
  getExpense, updateExpense, approveExpense, rejectExpense, cancelExpense,
  recordExpensePayment, markExpensePaid, addAttachments, softDeleteExpense,
} from "@/lib/expenses/service";
import { actorRole, actorId, actorName, canUseExpenses, canApproveExpenses } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const expense = await getExpense(params.id);
    if (!expense || expense.deletedAt) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    return NextResponse.json({ expense }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expense.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load expense." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = actorRole(req);
  if (!canUseExpenses(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = { actorId: actorId(req), actorName: actorName(req), actorRole: role };
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const needsApprover = ["approve", "reject", "cancel", "delete"];
  if (needsApprover.includes(String(body.action)) && !canApproveExpenses(role)) {
    return NextResponse.json({ error: "Only an Admin or Super Admin can perform this action." }, { status: 403 });
  }

  try {
    switch (body.action) {
      case "update": return NextResponse.json({ ok: true, expense: await updateExpense(params.id, body.patch, actor) });
      case "approve": return NextResponse.json({ ok: true, expense: await approveExpense(params.id, actor) });
      case "reject": return NextResponse.json({ ok: true, expense: await rejectExpense(params.id, actor, body.reason as string | undefined) });
      case "cancel": return NextResponse.json({ ok: true, expense: await cancelExpense(params.id, actor) });
      case "pay": return NextResponse.json({ ok: true, expense: await recordExpensePayment(params.id, body.payment, actor) });
      case "markPaid": return NextResponse.json({ ok: true, expense: await markExpensePaid(params.id, actor) });
      case "attach": return NextResponse.json({ ok: true, expense: await addAttachments(params.id, (body.attachments as never[]) ?? [], actor) });
      case "delete": return NextResponse.json({ ok: true, result: await softDeleteExpense(params.id, actor) });
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
