/* =============================================================
   DOODLY HR → Employee Master — service layer (Prisma).
   An employee IS a staff User (reuses auth + Role + status) with a
   1:1 EmployeeProfile carrying the HR fields. No duplicate identity
   table. Sensitive identity docs (Aadhaar/PAN/bank) are only returned
   when the caller is authorised (includePii). Every write is audited.
   ============================================================= */
import "server-only";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import type { NextRequest } from "next/server";
import { Errors } from "@/lib/http";
import { signedUrl, isStorageConfigured } from "@/lib/storage/hr-docs";

export interface Actor { actorId?: string; actorRole?: string; ip?: string | null }

const STAFF_ROLES: Role[] = ["DELIVERY_EXECUTIVE", "SUPPORT", "OPERATIONS", "PROCUREMENT", "ACCOUNTANT", "INVENTORY", "QUALITY", "MARKETING", "ADMIN", "SUPER_ADMIN"];
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };
const mask = (v?: string | null) => { const s = (v ?? "").trim(); if (!s) return null; return s.length <= 4 ? "••••" : "•••• " + s.slice(-4); };

/** Next EMP-#### code (count-based + collision-safe). */
async function nextEmployeeCode(): Promise<string> {
  const count = await db.employeeProfile.count();
  let n = 1 + count;
  for (let i = 0; i < 50; i++) {
    const code = `EMP-${String(n).padStart(4, "0")}`;
    const dup = await db.employeeProfile.findUnique({ where: { employeeCode: code }, select: { id: true } });
    if (!dup) return code;
    n++;
  }
  return `EMP-${Date.now().toString(36).toUpperCase()}`;
}

// ---------------------------------------------------------------- list
export interface ListArgs { q?: string; department?: string; status?: string; employmentType?: string; page?: number; pageSize?: number }
export async function listEmployees(a: ListArgs = {}) {
  const where: Prisma.EmployeeProfileWhereInput = { deletedAt: a.status === "deleted" ? { not: null } : null };
  if (a.department) where.department = a.department;
  if (a.status && a.status !== "deleted") where.status = a.status as Prisma.EnumEmploymentStatusFilter["equals"];
  if (a.employmentType) where.employmentType = a.employmentType as Prisma.EnumEmploymentTypeFilter["equals"];
  if (a.q?.trim()) {
    const q = a.q.trim();
    where.OR = [
      { employeeCode: { contains: q, mode: "insensitive" } },
      { designation: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  const page = Math.max(1, a.page ?? 1), pageSize = Math.min(200, Math.max(1, a.pageSize ?? 50));
  const [rows, total] = await Promise.all([
    db.employeeProfile.findMany({
      where, orderBy: { employeeCode: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, employeeCode: true, photoUrl: true, department: true, designation: true, employmentType: true, status: true, dateOfJoining: true, workLocation: true,
        user: { select: { name: true, email: true, phone: true, role: true, status: true } },
        reportingManager: { select: { user: { select: { name: true } } } } },
    }),
    db.employeeProfile.count({ where }),
  ]);
  // department stats + present/active counts (light, list-scope)
  const [byDept, active, onLeave] = await Promise.all([
    db.employeeProfile.groupBy({ by: ["department"], where: { deletedAt: null }, _count: { _all: true } }),
    db.employeeProfile.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.employeeProfile.count({ where: { deletedAt: null, status: "ON_LEAVE" } }),
  ]);
  return {
    items: rows.map((e) => ({
      id: e.id, employeeCode: e.employeeCode, photoUrl: e.photoUrl,
      name: e.user.name ?? "—", email: e.user.email, phone: e.user.phone, role: e.user.role, userStatus: e.user.status,
      department: e.department, designation: e.designation, employmentType: e.employmentType, status: e.status,
      dateOfJoining: e.dateOfJoining.toISOString(), workLocation: e.workLocation,
      reportingManager: e.reportingManager?.user.name ?? null,
    })),
    total, page, pageSize, pages: Math.ceil(total / pageSize),
    stats: { total, active, onLeave, byDept: byDept.map((d) => ({ department: d.department, count: d._count._all })) },
  };
}

// ---------------------------------------------------------------- detail
export async function employeeDetail(id: string, includePii: boolean) {
  const e = await db.employeeProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true } },
      reportingManager: { select: { id: true, employeeCode: true, user: { select: { name: true } } } },
      salaryStructures: { where: { active: true }, orderBy: { effectiveFrom: "desc" }, take: 1 },
    },
  });
  if (!e || e.deletedAt) throw Errors.notFound("Employee not found.");
  // Documents are sensitive PII proofs → signed URLs only for callers who can edit employees (HR/admin).
  const rawDocs = (Array.isArray(e.documents) ? e.documents : []) as Array<{ label?: string; name?: string; path?: string; type?: string; size?: number; uploadedAt?: string }>;
  const docs = await Promise.all(rawDocs.map(async (d) => ({ ...d, url: includePii && d.path ? await signedUrl(d.path) : null })));
  const photoSignedUrl = await signedUrl(e.photoUrl);
  const identity = includePii
    ? { aadhaar: e.aadhaar, pan: e.pan, drivingLicence: e.drivingLicence, bankAccount: e.bankAccount, ifsc: e.ifsc, bankName: e.bankName, upiId: e.upiId }
    : { aadhaar: mask(e.aadhaar), pan: mask(e.pan), drivingLicence: mask(e.drivingLicence), bankAccount: mask(e.bankAccount), ifsc: e.ifsc, bankName: e.bankName, upiId: e.upiId };
  return {
    id: e.id, employeeCode: e.employeeCode, userId: e.userId,
    name: e.user.name, email: e.user.email, phone: e.user.phone, role: e.user.role, userStatus: e.user.status,
    photoUrl: e.photoUrl, photoSignedUrl, altPhone: e.altPhone, dob: e.dob?.toISOString() ?? null, gender: e.gender, bloodGroup: e.bloodGroup,
    emergencyName: e.emergencyName, emergencyPhone: e.emergencyPhone,
    department: e.department, designation: e.designation, employmentType: e.employmentType, dateOfJoining: e.dateOfJoining.toISOString(),
    reportingManagerId: e.reportingManagerId, reportingManager: e.reportingManager ? { id: e.reportingManager.id, code: e.reportingManager.employeeCode, name: e.reportingManager.user.name } : null,
    workLocation: e.workLocation, status: e.status, notes: e.notes,
    identity, documents: docs, piiVisible: includePii, storageConfigured: isStorageConfigured(),
    salary: e.salaryStructures[0] ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------- create
export interface CreateArgs {
  name: string; phone?: string; email?: string; role?: string;
  department: string; designation: string; employmentType?: string; dateOfJoining: string;
  reportingManagerId?: string; workLocation?: string;
  altPhone?: string; dob?: string; gender?: string; bloodGroup?: string; emergencyName?: string; emergencyPhone?: string;
  aadhaar?: string; pan?: string; drivingLicence?: string; bankAccount?: string; ifsc?: string; bankName?: string; upiId?: string;
  status?: string; notes?: string; userId?: string;
}
export async function createEmployee(a: CreateArgs, actor: Actor, ctx?: NextRequest) {
  const role = (STAFF_ROLES.includes((a.role ?? "").toUpperCase() as Role) ? (a.role!.toUpperCase() as Role) : "SUPPORT");
  // uniqueness (skip when linking an existing user)
  if (!a.userId) {
    if (a.email) { const c = await db.user.findUnique({ where: { email: a.email.toLowerCase() } }); if (c) throw Errors.conflict("A user with this email already exists."); }
    if (a.phone) { const c = await db.user.findUnique({ where: { phone: a.phone } }); if (c) throw Errors.conflict("A user with this phone already exists."); }
  }
  const employeeCode = await nextEmployeeCode();
  const emp = await db.$transaction(async (tx) => {
    let userId = a.userId;
    if (userId) {
      const existing = await tx.employeeProfile.findUnique({ where: { userId }, select: { id: true } });
      if (existing) throw Errors.conflict("That user already has an employee profile.");
    } else {
      const u = await tx.user.create({ data: { name: a.name, email: a.email ? a.email.toLowerCase() : null, phone: clean(a.phone), role, status: "ACTIVE" }, select: { id: true } });
      userId = u.id;
    }
    return tx.employeeProfile.create({
      data: {
        userId: userId!, employeeCode,
        department: a.department, designation: a.designation,
        employmentType: (a.employmentType as Prisma.EmployeeProfileCreateInput["employmentType"]) ?? "FULL_TIME",
        dateOfJoining: new Date(a.dateOfJoining), reportingManagerId: clean(a.reportingManagerId), workLocation: clean(a.workLocation),
        status: (a.status as Prisma.EmployeeProfileCreateInput["status"]) ?? "ACTIVE",
        altPhone: clean(a.altPhone), dob: a.dob ? new Date(a.dob) : null, gender: clean(a.gender), bloodGroup: clean(a.bloodGroup),
        emergencyName: clean(a.emergencyName), emergencyPhone: clean(a.emergencyPhone),
        aadhaar: clean(a.aadhaar), pan: clean(a.pan), drivingLicence: clean(a.drivingLicence),
        bankAccount: clean(a.bankAccount), ifsc: clean(a.ifsc), bankName: clean(a.bankName), upiId: clean(a.upiId),
        notes: clean(a.notes),
      },
      select: { id: true, employeeCode: true },
    });
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.create", target: emp.employeeCode, ctx: reqContext(ctx) });
  return emp;
}

// ---------------------------------------------------------------- update (audits the delta)
const PROFILE_KEYS = ["department", "designation", "employmentType", "workLocation", "status", "reportingManagerId", "altPhone", "gender", "bloodGroup", "emergencyName", "emergencyPhone", "aadhaar", "pan", "drivingLicence", "bankAccount", "ifsc", "bankName", "upiId", "notes", "photoUrl"] as const;
export async function updateEmployee(id: string, patch: Record<string, unknown>, actor: Actor, ctx?: NextRequest) {
  const cur = await db.employeeProfile.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true, phone: true, role: true } } } });
  if (!cur || cur.deletedAt) throw Errors.notFound("Employee not found.");

  const userData: Prisma.UserUpdateInput = {};
  if (typeof patch.name === "string") userData.name = patch.name.trim();
  if (typeof patch.email === "string") userData.email = patch.email.trim().toLowerCase() || null;
  if (typeof patch.phone === "string") userData.phone = clean(patch.phone);
  if (typeof patch.role === "string" && STAFF_ROLES.includes(patch.role.toUpperCase() as Role)) userData.role = patch.role.toUpperCase() as Role;

  const profData: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) if (patch[k] !== undefined) profData[k] = typeof patch[k] === "string" ? clean(patch[k] as string) : patch[k];
  if (patch.dateOfJoining) profData.dateOfJoining = new Date(patch.dateOfJoining as string);
  if (patch.dob !== undefined) profData.dob = patch.dob ? new Date(patch.dob as string) : null;

  const changed: string[] = [];
  for (const k of Object.keys(profData)) if (String((cur as Record<string, unknown>)[k] ?? "") !== String(profData[k] ?? "")) changed.push(k);

  await db.$transaction(async (tx) => {
    if (Object.keys(userData).length) await tx.user.update({ where: { id: cur.userId }, data: userData });
    if (Object.keys(profData).length) await tx.employeeProfile.update({ where: { id }, data: profData as Prisma.EmployeeProfileUpdateInput });
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.update", target: `${cur.employeeCode} · ${changed.join(",") || "profile"}`, ctx: reqContext(ctx) });
  return { id, changed };
}

// ---------------------------------------------------------------- soft delete / status
export async function setEmployeeStatus(id: string, status: string, actor: Actor, ctx?: NextRequest) {
  const cur = await db.employeeProfile.findUnique({ where: { id }, select: { employeeCode: true, userId: true } });
  if (!cur) throw Errors.notFound("Employee not found.");
  await db.$transaction(async (tx) => {
    await tx.employeeProfile.update({ where: { id }, data: { status: status as Prisma.EmployeeProfileUpdateInput["status"] } });
    if (status === "RESIGNED" || status === "TERMINATED") await tx.user.update({ where: { id: cur.userId }, data: { status: "DISABLED" } });
    else if (status === "ACTIVE") await tx.user.update({ where: { id: cur.userId }, data: { status: "ACTIVE" } });
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.status", target: `${cur.employeeCode} → ${status}`, ctx: reqContext(ctx) });
  return { id, status };
}
export async function softDeleteEmployee(id: string, actor: Actor, ctx?: NextRequest) {
  const cur = await db.employeeProfile.findUnique({ where: { id }, select: { employeeCode: true, userId: true } });
  if (!cur) throw Errors.notFound("Employee not found.");
  await db.$transaction(async (tx) => {
    await tx.employeeProfile.update({ where: { id }, data: { deletedAt: new Date(), status: "TERMINATED" } });
    await tx.user.update({ where: { id: cur.userId }, data: { status: "DISABLED" } });
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "employee.delete", target: cur.employeeCode, ctx: reqContext(ctx) });
  return { deleted: true };
}

// ---------------------------------------------------------------- HR dashboard KPIs
export async function hrDashboard() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [total, active, onLeave, resigned, byDept, byType, presentToday, absentToday, advancesOutstanding, payslipsDraft] = await Promise.all([
    db.employeeProfile.count({ where: { deletedAt: null } }),
    db.employeeProfile.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.employeeProfile.count({ where: { deletedAt: null, status: "ON_LEAVE" } }),
    db.employeeProfile.count({ where: { deletedAt: null, status: { in: ["RESIGNED", "TERMINATED"] } } }),
    db.employeeProfile.groupBy({ by: ["department"], where: { deletedAt: null }, _count: { _all: true } }),
    db.employeeProfile.groupBy({ by: ["employmentType"], where: { deletedAt: null }, _count: { _all: true } }),
    db.attendance.count({ where: { date: today, status: { in: ["PRESENT", "HALF_DAY", "WFH"] } } }),
    // Absent = actually marked ABSENT. Deriving it as (active - present - onLeave) counted
    // WEEKLY_OFF / HOLIDAY / PAID_LEAVE / SICK_LEAVE as absence — on a Sunday with everyone
    // on weekly-off it reported 100% absenteeism.
    db.attendance.count({ where: { date: today, status: "ABSENT" } }),
    db.salaryAdvance.aggregate({ where: { status: { in: ["APPROVED"] } }, _sum: { remainingPaise: true } }),
    db.payslip.count({ where: { status: "DRAFT" } }),
  ]);
  return {
    kpis: { total, active, onLeave, resigned, presentToday, absentToday, payslipsPending: payslipsDraft, advancesOutstandingPaise: advancesOutstanding._sum.remainingPaise ?? 0 },
    byDepartment: byDept.map((d) => ({ department: d.department, count: d._count._all })).sort((a, b) => b.count - a.count),
    byType: byType.map((d) => ({ type: d.employmentType, count: d._count._all })),
  };
}

/** Managers list (for the reporting-manager dropdown). */
export async function managerOptions() {
  const rows = await db.employeeProfile.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, employeeCode: true, user: { select: { name: true } } }, orderBy: { employeeCode: "asc" }, take: 500 });
  return rows.map((r) => ({ id: r.id, code: r.employeeCode, name: r.user.name ?? r.employeeCode }));
}
