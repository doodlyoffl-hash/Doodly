/* /api/expenses/reports — category/vendor/payment-mode/outstanding/GST. Accountant+.
   GET ?from&to&preset&categoryId&paymentMode&status&vendor */
import { NextRequest, NextResponse } from "next/server";
import { expenseReports } from "@/lib/expenses/service";
import { resolveDatePreset, type DatePreset, type ExpenseStatus } from "@/lib/expenses/engine";
import { actorRole, canUseExpenses } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const preset = sp.get("preset") as DatePreset | null;
    const range = preset ? resolveDatePreset(preset) : {};
    const report = await expenseReports({
      from: sp.get("from") ?? range.from,
      to: sp.get("to") ?? range.to,
      categoryId: sp.get("categoryId") ?? undefined,
      paymentMode: sp.get("paymentMode") ?? undefined,
      status: (sp.get("status") as ExpenseStatus) ?? undefined,
      vendor: sp.get("vendor") ?? undefined,
    });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expense.reports.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}
