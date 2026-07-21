/* /api/admin/milk/tankers — milk tanker procurement batches (the FIFO cost source).
   GET  — list + stats (procurement:view). Filters: from/to/status/search, date=stats day.
   POST — record a tanker (procurement:create): computes cost from config, snapshots
          the rates, opens a FIFO lot. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { createTanker, listTankers, tankerStats } from "@/lib/milk/tanker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.tankers.list", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const sp = req.nextUrl.searchParams;
  const [tankers, stats] = await Promise.all([
    listTankers({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, status: sp.get("status") ?? undefined, search: sp.get("search") ?? undefined }),
    tankerStats(sp.get("date") ?? undefined),
  ]);
  return ok({ tankers, stats });
});

const createSchema = z.object({
  procurementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tankerNo: z.string().trim().min(1).max(40),
  supplier: z.string().trim().min(1).max(120),
  farmerId: z.string().optional().nullable(),
  quantityKg: z.number().positive(),
  fatPct: z.number().min(0).max(100),
  snfPct: z.number().min(0).max(100).optional().nullable(),
  transportPaise: z.number().int().min(0).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});

export const POST = route("admin.milk.tankers.create", async (req: NextRequest) => {
  const role = requirePermission(req, "procurement", "create");
  const body = await parseBody(req, createSchema);
  const tanker = await createTanker(body, { actorId: readUserId(req) ?? undefined, actorRole: role });
  return ok({ tanker }, { status: 201 });
});
