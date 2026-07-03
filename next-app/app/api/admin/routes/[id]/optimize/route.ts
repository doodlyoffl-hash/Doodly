/* POST /api/admin/routes/[id]/optimize — reorder stops via nearest-neighbour +
   stamp distance/duration. RBAC: routes:edit. Audited. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { optimizeRoute } from "@/lib/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const POST = route("admin.routes.optimize", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "routes", "edit");
  const res = await optimizeRoute(params.id, { actorRole: role });
  await audit({ actorRole: role, action: "route.optimize", target: params.id, ctx: reqContext(req) });
  return ok({ result: res });
});
