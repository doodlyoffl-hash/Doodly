/* GET /api/admin/milk/pending — FIFO carry-forward Pending Allocation queue (procurement:view).
   Days whose sales exceeded open tanker stock, waiting for the next tanker to absorb them. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { listPendingAllocations } from "@/lib/milk/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IST = 5.5 * 3600e3;
const istISO = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

export const GET = route("admin.milk.pending", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const rows = await listPendingAllocations();
  const pending = rows.map((p) => ({ id: p.id, date: istISO(p.date), retailLitres: p.retailLitres, b2bLitres: p.b2bLitres, totalLitres: p.totalLitres, soldRetailLitres: p.soldRetailLitres, soldB2bLitres: p.soldB2bLitres, reason: p.reason, createdAt: p.createdAt.toISOString() }));
  const totalLitres = Math.round(pending.reduce((s, p) => s + p.totalLitres, 0) * 100) / 100;
  return ok({ pending, count: pending.length, totalLitres });
});
