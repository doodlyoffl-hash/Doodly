/* /api/bulk-orders/[id]  (admin, RBAC: orders:edit)
   PATCH — discriminated by `action`: status | note | assign | edit
   DELETE — remove a request (notes cascade) */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateBulkStatus, addBulkNote, assignBulkStaff, updateBulkRequest, deleteBulkRequest, getBulkRequest } from "@/lib/bulk/service";
import { BULK_STATUSES } from "@/lib/bulk/workflow";
import { actorFrom, canManageBulk, canViewBulk } from "@/lib/bulk/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = actorFrom(req);
  if (!canViewBulk(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const request = await getBulkRequest(params.id);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ request }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("bulk.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load the request." }, { status: 500 });
  }
}

const Patch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(BULK_STATUSES) }),
  z.object({ action: z.literal("note"), body: z.string().min(1) }),
  z.object({ action: z.literal("assign"), assignedToId: z.string().nullable() }),
  z.object({ action: z.literal("edit"), patch: z.record(z.unknown()) }),
]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = actorFrom(req);
  if (!canManageBulk(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const a = { actorId: actor.actorId, actorRole: actor.actorRole };
  try {
    const d = parsed.data;
    const result =
      d.action === "status" ? await updateBulkStatus({ id: params.id, status: d.status, ...a })
      : d.action === "note" ? await addBulkNote({ id: params.id, body: d.body, ...a })
      : d.action === "assign" ? await assignBulkStaff({ id: params.id, assignedToId: d.assignedToId, ...a })
      : await updateBulkRequest({ id: params.id, patch: d.patch as never, ...a });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Update failed" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = actorFrom(req);
  if (!canManageBulk(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await deleteBulkRequest(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("bulk.delete", (e as Error)?.message);
    return NextResponse.json({ error: "Could not delete the request." }, { status: 500 });
  }
}
