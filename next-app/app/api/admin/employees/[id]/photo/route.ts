/* POST /api/admin/employees/[id]/photo — upload/replace an employee photo.
   multipart/form-data with a `file` field. RBAC: employees.edit. */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { setEmployeePhoto } from "@/lib/employees/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const POST = route("admin.employees.photo", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "employees", "edit");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw Errors.badRequest("No file uploaded.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  return ok(await setEmployeePhoto(params.id, { bytes, type: file.type || "application/octet-stream", size: bytes.length, name: file.name || "photo" }, actor, req));
});
