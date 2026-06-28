/* /api/expenses/categories/[id] — PATCH update / DELETE soft-delete (Admin+). */
import { NextRequest, NextResponse } from "next/server";
import { updateCategory, deleteCategory } from "@/lib/expenses/service";
import { actorRole, canManageExpenseSettings } from "@/lib/expenses/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canManageExpenseSettings(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, category: await updateCategory(params.id, json) });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not update category" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canManageExpenseSettings(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, category: await deleteCategory(params.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not delete category" }, { status: 409 });
  }
}
