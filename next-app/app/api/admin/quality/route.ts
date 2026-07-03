/* /api/admin/quality — lab quality tests on collected batches.
   GET  — enriched quality records (batch + test, incl. pending) + stats + rules (quality:view).
   POST — record a test (quality:create); a fail rejects the batch AND removes it from
          raw-milk inventory if it had been accepted. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { listQuality } from "@/lib/quality/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAW_MILK_SKU = "MILK_RAW";

export const GET = route("admin.quality.list", async (req: NextRequest) => {
  requirePermission(req, "quality", "view");
  const sp = req.nextUrl.searchParams;
  const res = await listQuality({
    search: sp.get("search") ?? undefined, status: sp.get("status") ?? undefined, farmerId: sp.get("farmerId") ?? undefined,
    center: sp.get("center") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined,
  });
  return ok({ quality: res.items, stats: res.stats, rules: res.config });
});

const createSchema = z.object({
  procurementId: z.string().min(1),
  fatPct: z.number().min(0).max(100),
  snfPct: z.number().min(0).max(100),
  lactometer: z.number(),
  temperatureC: z.number(),
  passed: z.boolean(),
  rejectReason: z.string().trim().max(160).optional(),
});

export const POST = route("admin.quality.create", async (req: NextRequest) => {
  const role = requirePermission(req, "quality", "create");
  const body = await parseBody(req, createSchema);

  const proc = await db.procurement.findUnique({ where: { id: body.procurementId }, select: { id: true, accepted: true, litres: true, qualityTest: { select: { id: true } } } });
  if (!proc) throw Errors.badRequest("That batch does not exist.");
  if (proc.qualityTest) throw Errors.conflict("This batch has already been tested.");

  const test = await db.$transaction(async (tx) => {
    const t = await tx.qualityTest.create({
      data: {
        procurementId: body.procurementId, fatPct: body.fatPct, snfPct: body.snfPct, lactometer: body.lactometer, temperatureC: body.temperatureC,
        passed: body.passed, rejectReason: body.passed ? null : body.rejectReason ?? "Did not meet quality standards",
      },
      select: { id: true, passed: true },
    });
    // a failed test rejects the batch — and pulls it back out of raw-milk inventory if it was accepted
    if (!body.passed) {
      await tx.procurement.update({ where: { id: body.procurementId }, data: { accepted: false } });
      if (proc.accepted) {
        const raw = await tx.inventoryItem.findFirst({ where: { sku: RAW_MILK_SKU }, select: { id: true } });
        if (raw) await tx.inventoryItem.update({ where: { id: raw.id }, data: { quantity: { decrement: proc.litres } } });
      }
    }
    return t;
  });

  await audit({ actorRole: role, action: body.passed ? "quality.pass" : "quality.fail", target: body.procurementId, ctx: reqContext(req) });
  return ok({ test }, { status: 201 });
});
