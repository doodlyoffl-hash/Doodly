/* =============================================================
   DOODLY HR → Salary structure + Salary advances (Prisma).
   Salary structure: one active SalaryStructure per employee (history
   kept). Advances: request → approve/reject → installment recovery
   (recovery is applied by payroll when a payslip is PAID). All paise.
   Reuses EmployeeProfile + notify() + AuditLog.
   ============================================================= */
import "server-only";
import { Prisma, type AdvanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { notify } from "@/lib/notifications/dispatch";
import type { NextRequest } from "next/server";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string }
const rupees = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");

// ---------------------------------------------------------------- salary structure
export function grossOf(s: { basicPaise: number; hraPaise: number; conveyancePaise: number; specialPaise: number; otherEarnPaise: number }) {
  return s.basicPaise + s.hraPaise + s.conveyancePaise + s.specialPaise + s.otherEarnPaise;
}
export async function getStructure(employeeId: string) {
  const s = await db.salaryStructure.findFirst({ where: { employeeId, active: true }, orderBy: { effectiveFrom: "desc" } });
  return s ? { ...s, grossPaise: grossOf(s), fixedDeductPaise: s.ptPaise + s.otherDeductPaise } : null;
}
export async function setStructure(employeeId: string, a: { basicPaise: number; hraPaise?: number; conveyancePaise?: number; specialPaise?: number; otherEarnPaise?: number; ptPaise?: number; otherDeductPaise?: number; effectiveFrom?: string; note?: string }, actor: Actor, ctx?: NextRequest) {
  const emp = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { employeeCode: true } });
  if (!emp) throw Errors.notFound("Employee not found.");
  const s = await db.$transaction(async (tx) => {
    await tx.salaryStructure.updateMany({ where: { employeeId, active: true }, data: { active: false } });
    return tx.salaryStructure.create({ data: {
      employeeId, effectiveFrom: a.effectiveFrom ? new Date(a.effectiveFrom) : new Date(),
      basicPaise: a.basicPaise, hraPaise: a.hraPaise ?? 0, conveyancePaise: a.conveyancePaise ?? 0, specialPaise: a.specialPaise ?? 0,
      otherEarnPaise: a.otherEarnPaise ?? 0, ptPaise: a.ptPaise ?? 0, otherDeductPaise: a.otherDeductPaise ?? 0,
      note: a.note?.trim() || null, active: true, createdById: actor.actorId ?? null,
    } });
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "salary.structure.set", target: `${emp.employeeCode} gross ${rupees(grossOf(s))}`, ctx: reqContext(ctx) });
  return { id: s.id, grossPaise: grossOf(s) };
}

// ---------------------------------------------------------------- advances
async function nextAdvanceCode(): Promise<string> {
  const count = await db.salaryAdvance.count();
  let n = 1 + count;
  for (let i = 0; i < 50; i++) { const c = `ADV-${String(n).padStart(4, "0")}`; if (!(await db.salaryAdvance.findUnique({ where: { code: c }, select: { id: true } }))) return c; n++; }
  return `ADV-${Date.now().toString(36).toUpperCase()}`;
}
export async function createAdvance(a: { employeeId: string; amountPaise: number; reason?: string; installments?: number; recoveryMethod?: string }, actor: Actor, ctx?: NextRequest) {
  const emp = await db.employeeProfile.findUnique({ where: { id: a.employeeId }, select: { employeeCode: true } });
  if (!emp) throw Errors.notFound("Employee not found.");
  if (a.amountPaise <= 0) throw Errors.badRequest("Amount must be greater than zero.");
  const installments = Math.max(1, Math.min(24, a.installments ?? 1));
  const code = await nextAdvanceCode();
  const adv = await db.salaryAdvance.create({ data: {
    code, employeeId: a.employeeId, amountPaise: a.amountPaise, reason: a.reason?.trim() || null, requestedById: actor.actorId ?? null,
    status: "PENDING", recoveryMethod: a.recoveryMethod === "LUMPSUM" ? "LUMPSUM" : "SALARY", installments,
    installmentPaise: Math.ceil(a.amountPaise / installments), remainingPaise: a.amountPaise,
  }, select: { id: true, code: true } });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "advance.create", target: `${emp.employeeCode} ${code} ${rupees(a.amountPaise)}`, ctx: reqContext(ctx) });
  return adv;
}
export async function decideAdvance(id: string, action: "approve" | "reject", opts: { reason?: string }, actor: Actor, ctx?: NextRequest) {
  const adv = await db.salaryAdvance.findUnique({ where: { id }, include: { employee: { select: { employeeCode: true, userId: true } } } });
  if (!adv) throw Errors.notFound("Advance not found.");
  if (adv.status !== "PENDING") throw Errors.conflict("This advance is already decided.");
  if (action === "reject") {
    await db.salaryAdvance.update({ where: { id }, data: { status: "REJECTED", rejectReason: opts.reason?.trim() || null, approvedById: actor.actorId ?? null, approvalDate: new Date() } });
    try { await notify(adv.employee.userId, { title: "Salary advance rejected", body: `Your advance request ${adv.code} was not approved${opts.reason ? ": " + opts.reason : "."}` }); } catch { /* non-blocking */ }
    if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "advance.reject", target: `${adv.employee.employeeCode} ${adv.code}`, ctx: reqContext(ctx) });
    return { id, status: "REJECTED" as const };
  }
  await db.salaryAdvance.update({ where: { id }, data: { status: "APPROVED", approvedById: actor.actorId ?? null, approvalDate: new Date() } });
  try { await notify(adv.employee.userId, { title: "Salary advance approved ✅", body: `Your advance ${adv.code} of ${rupees(adv.amountPaise)} is approved — recovered over ${adv.installments} salary cycle(s).` }); } catch { /* non-blocking */ }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "advance.approve", target: `${adv.employee.employeeCode} ${adv.code} ${rupees(adv.amountPaise)}`, ctx: reqContext(ctx) });
  return { id, status: "APPROVED" as const };
}
export async function listAdvances(f: { status?: string; employeeId?: string; q?: string; page?: number; pageSize?: number } = {}) {
  const where: Prisma.SalaryAdvanceWhereInput = {};
  if (f.status) where.status = f.status as AdvanceStatus;
  if (f.employeeId) where.employeeId = f.employeeId;
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ code: { contains: q, mode: "insensitive" } }, { employee: { employeeCode: { contains: q, mode: "insensitive" } } }, { employee: { user: { name: { contains: q, mode: "insensitive" } } } }]; }
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const [rows, total, agg, pending] = await Promise.all([
    db.salaryAdvance.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { employee: { select: { employeeCode: true, department: true, user: { select: { name: true } } } } } }),
    db.salaryAdvance.count({ where }),
    db.salaryAdvance.aggregate({ where: { status: "APPROVED" }, _sum: { remainingPaise: true } }),
    db.salaryAdvance.count({ where: { status: "PENDING" } }),
  ]);
  return {
    rows: rows.map((a) => ({ id: a.id, code: a.code, employeeCode: a.employee.employeeCode, name: a.employee.user.name ?? "—", department: a.employee.department,
      amountPaise: a.amountPaise, remainingPaise: a.remainingPaise, recoveredPaise: a.recoveredPaise, installments: a.installments, installmentPaise: a.installmentPaise,
      recoveryMethod: a.recoveryMethod, reason: a.reason, status: a.status, requestDate: a.requestDate.toISOString() })),
    total, page, pageSize, stats: { pending, outstandingPaise: agg._sum.remainingPaise ?? 0 },
  };
}
