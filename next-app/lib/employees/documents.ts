/* =============================================================
   DOODLY HR → employee photo + document management.
   Uploads go to the private Supabase HR bucket via the service-role
   client; the DB stores only the object path (photoUrl) / a small
   metadata array (documents Json). Signed URLs are minted on read.
   All mutations are audited. Reused by the employee detail UI.
   ============================================================= */
import "server-only";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { uploadHrFile, removeHrFile, signedUrl, isStorageConfigured } from "@/lib/storage/hr-docs";

export interface Actor { actorId?: string; actorRole?: string }
export interface HrDoc { label: string; name: string; path: string; type: string; size: number; uploadedAt: string }

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const extFor = (type: string) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" } as Record<string, string>)[type] || "bin";
const slug = (s: string) => (s || "file").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";

export interface IncomingFile { bytes: Buffer; type: string; size: number; name: string }
function validate(f: IncomingFile) {
  if (!isStorageConfigured()) throw Errors.badRequest("File storage is not configured yet. Add the Supabase Storage keys to enable uploads.");
  if (!f.size) throw Errors.badRequest("The file is empty.");
  if (f.size > MAX_BYTES) throw Errors.badRequest("File is too large (max 5 MB).");
  if (!ALLOWED.has(f.type)) throw Errors.badRequest("Only PNG, JPG, WEBP or PDF files are allowed.");
}
async function findEmp(id: string) {
  const emp = await db.employeeProfile.findFirst({ where: { id, deletedAt: null }, select: { id: true, employeeCode: true, photoUrl: true, documents: true } });
  if (!emp) throw Errors.notFound("Employee not found.");
  return emp;
}

/** Replace the employee's profile photo. */
export async function setEmployeePhoto(id: string, f: IncomingFile, actor: Actor, ctx?: NextRequest) {
  validate(f);
  if (f.type === "application/pdf") throw Errors.badRequest("Please upload an image for the profile photo.");
  const emp = await findEmp(id);
  const path = `${id}/photo-${Date.now()}.${extFor(f.type)}`;
  await uploadHrFile(path, f.bytes, f.type);
  if (emp.photoUrl && emp.photoUrl !== path) await removeHrFile(emp.photoUrl);
  await db.employeeProfile.update({ where: { id }, data: { photoUrl: path } });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.photo.set", target: emp.employeeCode, ctx: reqContext(ctx) });
  return { photoUrl: path, url: await signedUrl(path) };
}

/** Attach a document (label + file) to an employee. */
export async function addEmployeeDocument(id: string, f: IncomingFile, meta: { label?: string }, actor: Actor, ctx?: NextRequest) {
  validate(f);
  const emp = await findEmp(id);
  const label = (meta.label || "").trim().slice(0, 60) || "Document";
  const path = `${id}/docs/${Date.now()}-${slug(meta.label || f.name)}.${extFor(f.type)}`;
  await uploadHrFile(path, f.bytes, f.type);
  const docs = (Array.isArray(emp.documents) ? emp.documents : []) as unknown as HrDoc[];
  const doc: HrDoc = { label, name: f.name.slice(0, 120), path, type: f.type, size: f.size, uploadedAt: new Date().toISOString() };
  await db.employeeProfile.update({ where: { id }, data: { documents: [...docs, doc] as unknown as object[] } });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.document.add", target: `${emp.employeeCode} · ${label}`, ctx: reqContext(ctx) });
  return { document: { ...doc, url: await signedUrl(path) } };
}

/** Remove one document by its stored path. */
export async function removeEmployeeDocument(id: string, path: string, actor: Actor, ctx?: NextRequest) {
  const emp = await findEmp(id);
  const docs = (Array.isArray(emp.documents) ? emp.documents : []) as unknown as HrDoc[];
  const doc = docs.find((d) => d.path === path);
  if (!doc) throw Errors.notFound("Document not found.");
  await removeHrFile(path);
  await db.employeeProfile.update({ where: { id }, data: { documents: docs.filter((d) => d.path !== path) as unknown as object[] } });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.document.remove", target: `${emp.employeeCode} · ${doc.label}`, ctx: reqContext(ctx) });
  return { ok: true };
}
