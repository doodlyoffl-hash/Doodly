/* /api/admin/milk/tankers/[id] — one tanker.
   GET    — detail incl. its consumption ledger (procurement:view).
   PATCH  — edit (procurement:edit) — only while OPEN and undrawn.
   DELETE — soft-delete (procurement:edit) — only while undrawn. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { db } from "@/lib/db";
import { updateTanker, deleteTanker, closeTanker } from "@/lib/milk/tanker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.tanker.get", async (req: NextRequest, ctx: { params: { id: string } }) => {
  requirePermission(req, "procurement", "view");
  const tanker = await db.milkTanker.findUnique({
    where: { id: ctx.params.id },
    include: { consumptions: { orderBy: { date: "desc" }, take: 200 }, farmer: { select: { id: true, name: true } } },
  });
  if (!tanker || tanker.deletedAt) throw Errors.notFound("Tanker not found.");
  return ok({ tanker });
});

const patchSchema = z.object({
  tankerNo: z.string().trim().min(1).max(40).optional(),
  supplier: z.string().trim().min(1).max(120).optional(),
  farmerId: z.string().optional().nullable(),
  quantityKg: z.number().positive().optional(),
  fatPct: z.number().min(0).max(100).optional(),
  snfPct: z.number().min(0).max(100).optional().nullable(),
  transportPaise: z.number().int().min(0).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});

const closeSchema = z.object({ action: z.literal("close"), reason: z.string().max(300).optional().nullable(), force: z.boolean().optional() });

export const PATCH = route("admin.milk.tanker.update", async (req: NextRequest, ctx: { params: { id: string } }) => {
  const role = requirePermission(req, "procurement", "edit");
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // action:"close" — close the tanker + freeze its report (force-close needs Super-Admin)
  if (raw.action === "close") {
    const c = closeSchema.safeParse(raw);
    if (!c.success) throw Errors.badRequest("Invalid close request.");
    if (c.data.force && role !== "super_admin") throw Errors.forbidden("Only a Super-Admin can force-close a tanker that still has milk.");
    const result = await closeTanker({ id: ctx.params.id, reason: c.data.reason ?? null, force: c.data.force }, { actorId: readUserId(req) ?? undefined, actorRole: role });
    return ok(result);
  }
  const p = patchSchema.safeParse(raw);
  if (!p.success) throw Errors.badRequest("Invalid tanker edit.", p.error.flatten());
  const tanker = await updateTanker(ctx.params.id, p.data, { actorId: readUserId(req) ?? undefined, actorRole: role });
  return ok({ tanker });
});

export const DELETE = route("admin.milk.tanker.delete", async (req: NextRequest, ctx: { params: { id: string } }) => {
  const role = requirePermission(req, "procurement", "edit");
  await deleteTanker(ctx.params.id, { actorId: readUserId(req) ?? undefined, actorRole: role });
  return ok({ ok: true });
});
