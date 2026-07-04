/* =============================================================
   DOODLY Careers → Job Applications — service (Prisma).
   Public apply-form submissions + an admin applicant tracker (ATS):
   status workflow, rating, internal notes, resume (inline base64 or
   external URL), soft-delete + restore, dashboard + reports.
   Resume files are size-capped inline; large-scale storage → blob
   store (future config). Reuses AuditLog via the route layer.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export const APP_STATUSES = ["NEW", "REVIEWING", "SHORTLISTED", "INTERVIEW", "REJECTED", "HIRED"] as const;
const STATUS_LABEL: Record<string, string> = { NEW: "New", REVIEWING: "Reviewing", SHORTLISTED: "Shortlisted", INTERVIEW: "Interview", REJECTED: "Rejected", HIRED: "Hired" };
export const POSITIONS = [
  "Delivery Executive", "Operations Executive", "Dairy Production Staff", "Quality Assurance & Testing", "Procurement & Farmer Relations",
  "Customer Support Executive", "Sales & Business Development", "Marketing & Social Media", "Graphic Designer", "Content Creator",
  "Software Developer", "UI/UX Designer", "Finance & Accounts", "Human Resources", "Warehouse & Inventory Executive", "Other",
];
export const RESUME_MAX_BYTES = 2 * 1024 * 1024; // 2 MB inline cap

type AppRow = Prisma.JobApplicationGetPayload<{}>;
function shape(a: AppRow, withResume = false) {
  return {
    id: a.id, refNo: a.refNo, fullName: a.fullName, phone: a.phone, email: a.email, city: a.city, position: a.position,
    experience: a.experience, coverLetter: a.coverLetter, status: a.status, statusLabel: STATUS_LABEL[a.status] || a.status,
    rating: a.rating, notes: a.notes, source: a.source,
    resumeName: a.resumeName, resumeType: a.resumeType, resumeUrl: a.resumeUrl, hasResume: !!(a.resumeData || a.resumeUrl || a.resumeName),
    resumeData: withResume ? a.resumeData : undefined,
    deletedAt: a.deletedAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}

// ---------------------------------------------------------------- schema (public apply)
export const ApplySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().toLowerCase().email().max(160),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  position: z.string().trim().min(2).max(80),
  experience: z.string().trim().max(200).optional().or(z.literal("")),
  coverLetter: z.string().trim().max(8000).optional().or(z.literal("")),
  resumeName: z.string().trim().max(200).optional().or(z.literal("")),
  resumeType: z.string().trim().max(120).optional().or(z.literal("")),
  resumeData: z.string().max(3_200_000).optional().or(z.literal("")), // base64 ~2.3MB
  resumeUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };

async function nextRef(): Promise<string> {
  const count = await db.jobApplication.count();
  let n = 1001 + count;
  for (let i = 0; i < 50; i++) { const r = `APP-${n}`; const dup = await db.jobApplication.findUnique({ where: { refNo: r }, select: { id: true } }); if (!dup) return r; n++; }
  return `APP-${n}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------- create (public)
// Only real document formats may be stored as resume payloads (type-spoofing guard).
const RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export async function createApplication(raw: unknown, ip?: string) {
  const d = ApplySchema.parse(raw);
  // base64 payload sanity: strip data-url prefix, enforce byte cap + type whitelist
  let data: string | null = null, rType = clean(d.resumeType);
  if (d.resumeData) {
    let b64 = d.resumeData;
    const m = /^data:([^;]+);base64,(.*)$/s.exec(b64);
    if (m) { b64 = m[2]; if (!rType) rType = m[1]; }
    if (!rType || !RESUME_TYPES.has(rType.toLowerCase()))
      throw new Error("Please upload your resume as PDF, DOC, DOCX or TXT — or paste a link instead.");
    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes > RESUME_MAX_BYTES) throw new Error("Resume is larger than 2 MB. Upload a smaller file or paste a link instead.");
    data = b64;
  }
  const refNo = await nextRef();
  const a = await db.jobApplication.create({
    data: {
      refNo, fullName: d.fullName, phone: d.phone, email: d.email, city: clean(d.city), position: d.position,
      experience: clean(d.experience), coverLetter: clean(d.coverLetter),
      resumeName: clean(d.resumeName), resumeType: rType, resumeData: data, resumeUrl: clean(d.resumeUrl),
      status: "NEW", source: "website", ip: ip ?? null,
    },
    select: { id: true, refNo: true },
  });
  return { id: a.id, refNo: a.refNo };
}

// ---------------------------------------------------------------- list + detail (admin)
export interface AppFilters { q?: string; status?: string; position?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean }
export async function listApplications(f: AppFilters = {}) {
  const where: Prisma.JobApplicationWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.status) where.status = f.status as Prisma.EnumAppStatusFilter["equals"];
  if (f.position) where.position = f.position;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ refNo: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { position: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }]; }
  const orderBy: Prisma.JobApplicationOrderByWithRelationInput = f.sort === "name" ? { fullName: "asc" } : f.sort === "position" ? { position: "asc" } : f.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };
  const total = await db.jobApplication.count({ where });
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  const rows = await db.jobApplication.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, refNo: true, fullName: true, phone: true, email: true, city: true, position: true, experience: true, coverLetter: true, status: true, rating: true, notes: true, source: true, resumeName: true, resumeType: true, resumeUrl: true, deletedAt: true, createdAt: true, updatedAt: true, resumeData: false } as Prisma.JobApplicationSelect });
  return { applications: rows.map((r) => shape(r as AppRow)), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function applicationDetail(id: string, withResume = false) {
  const a = await db.jobApplication.findFirst({ where: { OR: [{ id }, { refNo: id }] } });
  if (!a) throw new Error("Application not found");
  return shape(a, withResume);
}
export async function applicationResume(id: string) {
  const a = await db.jobApplication.findFirst({ where: { OR: [{ id }, { refNo: id }] }, select: { resumeName: true, resumeType: true, resumeData: true, resumeUrl: true } });
  if (!a) throw new Error("Application not found");
  return a;
}

// ---------------------------------------------------------------- mutations (admin)
export async function updateStatus(id: string, status: string) { return shape(await db.jobApplication.update({ where: { id }, data: { status: status as AppRow["status"] } })); }
export async function setNote(id: string, note: string) { return shape(await db.jobApplication.update({ where: { id }, data: { notes: note.trim() || null } })); }
export async function setRating(id: string, rating: number) { return shape(await db.jobApplication.update({ where: { id }, data: { rating: Math.max(0, Math.min(5, Math.round(rating))) || null } })); }
export const softDeleteApplication = async (id: string) => shape(await db.jobApplication.update({ where: { id }, data: { deletedAt: new Date() } }));
export const restoreApplication = async (id: string) => shape(await db.jobApplication.update({ where: { id }, data: { deletedAt: null } }));
export async function bulkApplications(action: string, ids: string[]) {
  if (action === "delete") return db.jobApplication.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }).then((r) => ({ count: r.count }));
  if (action === "restore") return db.jobApplication.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } }).then((r) => ({ count: r.count }));
  if (APP_STATUSES.includes(action as typeof APP_STATUSES[number])) return db.jobApplication.updateMany({ where: { id: { in: ids } }, data: { status: action as AppRow["status"] } }).then((r) => ({ count: r.count }));
  throw new Error("Unknown bulk action");
}

// ---------------------------------------------------------------- dashboard + reports
export async function careersDashboard() {
  const now = new Date();
  const [all, newToday, withCv] = await Promise.all([
    db.jobApplication.findMany({ where: { deletedAt: null }, select: { status: true, position: true } }),
    db.jobApplication.count({ where: { deletedAt: null, createdAt: { gte: soD(now) } } }),
    db.jobApplication.count({ where: { deletedAt: null, OR: [{ resumeData: { not: null } }, { resumeUrl: { not: null } }] } }),
  ]);
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const posTally: Record<string, number> = {};
  all.forEach((a) => { posTally[a.position] = (posTally[a.position] || 0) + 1; });
  const topPositions = Object.entries(posTally).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  return {
    kpis: {
      total: all.length, newApps: count("NEW"), newToday, reviewing: count("REVIEWING"), shortlisted: count("SHORTLISTED"),
      interview: count("INTERVIEW"), hired: count("HIRED"), rejected: count("REJECTED"), withResume: withCv,
      openPipeline: all.filter((a) => a.status !== "HIRED" && a.status !== "REJECTED").length,
    },
    topPositions,
  };
}
export async function careersReports(f: { from?: string; to?: string } = {}) {
  const where: Prisma.JobApplicationWhereInput = { deletedAt: null };
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  const rows = await db.jobApplication.findMany({ where, select: { status: true, position: true, city: true } });
  const tally = (key: (a: typeof rows[number]) => string | null) => { const m: Record<string, number> = {}; rows.forEach((a) => { const k = key(a) || "—"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count); };
  return { total: rows.length, byStatus: tally((a) => STATUS_LABEL[a.status] || a.status), byPosition: tally((a) => a.position), byCity: tally((a) => a.city) };
}
