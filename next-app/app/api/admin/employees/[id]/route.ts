/* /api/admin/employees/[id] — one employee.
   GET    detail (identity docs unmasked only for roles that can edit employees)
   PATCH  update profile / status  ·  DELETE soft-delete. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { can } from "@/lib/rbac";
import { employeeDetail, updateEmployee, setEmployeeStatus, softDeleteEmployee } from "@/lib/employees/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const GET = route("admin.employees.detail", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "employees", "view");
  const includePii = can(role, "employees", "edit");   // HR/Admin see full Aadhaar/PAN/bank; others see masked
  return ok({ employee: await employeeDetail(params.id, includePii) });
});

const patchSchema = z.object({
  action: z.enum(["update", "status", "delete"]).optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"]).optional(),
}).passthrough();

export const PATCH = route("admin.employees.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "employees", "edit");
  const body = await parseBody(req, patchSchema) as Record<string, unknown>;
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req), ip: reqContext(req).ip };
  if (body.action === "status" && typeof body.status === "string") return ok(await setEmployeeStatus(params.id, body.status, actor, req));
  const { action, ...patch } = body;
  return ok(await updateEmployee(params.id, patch, actor, req));
});

export const DELETE = route("admin.employees.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "employees", "delete");
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqContext(req).ip };
  return ok(await softDeleteEmployee(params.id, actor, req));
});
