/* /api/expenses/dashboard — summary cards, trends, breakdowns. Accountant+. */
import { NextRequest, NextResponse } from "next/server";
import { expenseDashboard } from "@/lib/expenses/service";
import { actorRole, canUseExpenses } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await expenseDashboard(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expense.dashboard.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load dashboard." }, { status: 500 });
  }
}
