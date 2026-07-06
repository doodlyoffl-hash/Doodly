/* /api/admin/employees/[id]/documents — employee documents (private bucket).
   POST   multipart/form-data { file, label? } — attach a document.
   DELETE ?path=<stored path> — remove a document.  RBAC: employees.edit. */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { addEmployeeDocument, removeEmployeeDocument } from "@/lib/employees/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const POST = route("admin.employees.doc.add", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "employees", "edit");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw Errors.badRequest("No file uploaded.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  return ok(await addEmployeeDocument(params.id, { bytes, type: file.type || "application/octet-stream", size: bytes.length, name: file.name || "document" }, { label: String(form.get("label") || "") }, actor, req));
});

export const DELETE = route("admin.employees.doc.remove", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "employees", "edit");
  const path = new URL(req.url).searchParams.get("path");
  if (!path) throw Errors.badRequest("A document path is required.");
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  return ok(await removeEmployeeDocument(params.id, path, actor, req));
});
