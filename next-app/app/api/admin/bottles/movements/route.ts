/* GET /api/admin/bottles/movements — paginated append-only movement ledger
   (bottle_movements + bottle_status_history). Search / filter / sort.
   RBAC: bottleInventory:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { bottleMovements, STAGES, type BottleStage } from "@/lib/bottles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.bottles.movements", async (req: NextRequest) => {
  requirePermission(req, "bottleInventory", "view");
  const sp = req.nextUrl.searchParams;
  const capRaw = Number(sp.get("capacityMl"));
  const stageRaw = sp.get("stage") as BottleStage | null;
  const res = await bottleMovements({
    search: sp.get("search") ?? undefined,
    capacityMl: Number.isFinite(capRaw) && capRaw > 0 ? capRaw : undefined,
    stage: stageRaw && STAGES.includes(stageRaw) ? stageRaw : undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Number(sp.get("pageSize")) || 20,
  });
  return ok(res);
});
