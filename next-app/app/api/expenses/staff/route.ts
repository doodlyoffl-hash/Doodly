/* /api/expenses/staff — active staff users for the Requested/Approved/Paid By
   pickers. Accountant / Admin / Super-Admin. */
import { NextRequest, NextResponse } from "next/server";
import { listStaffUsers } from "@/lib/expenses/service";
import { actorRole, canUseExpenses } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ staff: await listStaffUsers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expense.staff.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load staff." }, { status: 500 });
  }
}
