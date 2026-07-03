/* POST /api/admin/drivers/[id]/reset-password — issue a temporary password +
   force reset on next login. RBAC: drivers:edit. Audited. Returns the temp
   password once so the admin can share it (driver must change it on login). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { resetDriverPassword } from "@/lib/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const POST = route("admin.drivers.reset-password", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "drivers", "edit");
  const res = await resetDriverPassword(params.id, { actorRole: role });
  await audit({ actorRole: role, action: "driver.reset_password", target: params.id, ctx: reqContext(req) });
  return ok(res);
});
