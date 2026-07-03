/* POST /api/admin/farmers/[id]/settle — record settlement: mark all due
   collections paid. RBAC: farmers:edit. Audited. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { settleFarmer } from "@/lib/farmers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const POST = route("admin.farmers.settle", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "farmers", "edit");
  const res = await settleFarmer(params.id, { actorRole: role });
  await audit({ actorRole: role, action: "farmer.settle", target: params.id, ctx: reqContext(req) });
  return ok({ result: res });
});
