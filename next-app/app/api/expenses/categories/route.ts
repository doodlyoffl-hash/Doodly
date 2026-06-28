/* /api/expenses/categories — GET (Accountant+) list; POST (Admin+) create. */
import { NextRequest, NextResponse } from "next/server";
import { listCategories, createCategory } from "@/lib/expenses/service";
import { actorRole, canUseExpenses, canManageExpenseSettings } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseExpenses(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const categories = await listCategories({ includeInactive: req.nextUrl.searchParams.get("includeInactive") === "1" });
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("expense.categories.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load categories." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!canManageExpenseSettings(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, category: await createCategory(json) }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create category" }, { status: 409 });
  }
}
