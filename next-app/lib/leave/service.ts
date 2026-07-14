/* =============================================================
   DOODLY HR → Leave — service layer (Prisma).
   Apply → Manager approval → HR approval workflow, per-type yearly
   balances, and (on final approval) auto-marks the leave days in
   Attendance. Reuses EmployeeProfile + notify() + AuditLog.
   ============================================================= */
import "server-only";
import { Prisma, type LeaveType, type LeaveStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { notify } from "@/lib/notifications/dispatch";
import type { NextRequest } from "next/server";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string }
const DAY = (d: string | Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const DEFAULT_ALLOTMENT: Record<string, number> = { CASUAL: 12, SICK: 12, EARNED: 15, MATERNITY: 180, EMERGENCY: 6, LOSS_OF_PAY: 0 };
const LEAVE_TO_ATTENDANCE: Record<string, "SICK_LEAVE" | "PAID_LEAVE" | "ABSENT"> = { SICK: "SICK_LEAVE", LOSS_OF_PAY: "ABSENT", CASUAL: "PAID_LEAVE", EARNED: "PAID_LEAVE", MATERNITY: "PAID_LEAVE", EMERGENCY: "PAID_LEAVE" };

function daysBetween(from: Date, to: Date) { return Math.max(1, Math.round((DAY(to).getTime() - DAY(from).getTime()) / 86_400_000) + 1); }

async function nextLeaveCode(): Promise<string> {
  const count = await db.leaveRequest.count();
  let n = 1 + count;
  for (let i = 0; i < 50; i++) { const c = `LV-${String(n).padStart(4, "0")}`; if (!(await db.leaveRequest.findUnique({ where: { code: c }, select: { id: true } }))) return c; n++; }
  return `LV-${Date.now().toString(36).toUpperCase()}`;
}

/** Create a leave request (PENDING) and notify HR/admins. */
export async function createLeave(a: { employeeId: string; type: string; startDate: string; endDate: string; reason?: string; attachmentUrl?: string }, actor: Actor, ctx?: NextRequest) {
  const emp = await db.employeeProfile.findUnique({ where: { id: a.employeeId }, select: { id: true, employeeCode: true, userId: true, reportingManager: { select: { userId: true } }, user: { select: { name: true } } } });
  if (!emp) throw Errors.notFound("Employee not found.");
  const start = DAY(a.startDate), end = DAY(a.endDate);
  if (end < start) throw Errors.badRequest("End date can't be before the start date.");
  const days = daysBetween(start, end);
  const code = await nextLeaveCode();
  const lr = await db.leaveRequest.create({ data: { code, employeeId: a.employeeId, type: a.type as LeaveType, startDate: start, endDate: end, days, reason: a.reason?.trim() || null, attachmentUrl: a.attachmentUrl?.trim() || null, status: "PENDING" }, select: { id: true, code: true } });
  // notify the reporting manager (if any) + fall back handled by HR seeing the queue
  if (emp.reportingManager?.userId) { try { await notify(emp.reportingManager.userId, { title: "Leave request to review", body: `${emp.user.name || emp.employeeCode} requested ${days} day(s) ${a.type.replace(/_/g, " ").toLowerCase()} leave (${code}).` }); } catch { /* non-blocking */ } }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "leave.create", target: `${emp.employeeCode} ${code} ${a.type} ${days}d`, ctx: reqContext(ctx) });
  return lr;
}

/** List leave requests (admin/HR queue) with filters + stats. */
export async function listLeaves(f: { status?: string; type?: string; employeeId?: string; q?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  const where: Prisma.LeaveRequestWhereInput = {};
  if (f.status) where.status = f.status as LeaveStatus;
  if (f.type) where.type = f.type as LeaveType;
  if (f.employeeId) where.employeeId = f.employeeId;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = DAY(f.from); if (f.to) r.lte = new Date(DAY(f.to).getTime() + 86_400_000); where.startDate = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ code: { contains: q, mode: "insensitive" } }, { employee: { employeeCode: { contains: q, mode: "insensitive" } } }, { employee: { user: { name: { contains: q, mode: "insensitive" } } } }]; }
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const [rows, total, pending] = await Promise.all([
    db.leaveRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { employee: { select: { id: true, employeeCode: true, department: true, user: { select: { name: true } } } } } }),
    db.leaveRequest.count({ where }),
    db.leaveRequest.count({ where: { status: { in: ["PENDING", "MANAGER_APPROVED"] } } }),
  ]);
  return {
    rows: rows.map((r) => ({ id: r.id, code: r.code, employeeId: r.employeeId, employeeCode: r.employee.employeeCode, name: r.employee.user.name ?? "—", department: r.employee.department,
      type: r.type, startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString(), days: r.days, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() })),
    total, page, pageSize, pages: Math.ceil(total / pageSize), stats: { pending },
  };
}

/** Approve (manager → HR two-step) or reject. Final HR approval updates the balance + marks Attendance. */
export async function decideLeave(id: string, action: "approve" | "reject", opts: { reason?: string; asHr?: boolean }, actor: Actor, ctx?: NextRequest) {
  const lr = await db.leaveRequest.findUnique({ where: { id }, include: { employee: { select: { id: true, employeeCode: true, userId: true } } } });
  if (!lr) throw Errors.notFound("Leave request not found.");
  if (lr.status === "APPROVED" || lr.status === "REJECTED") throw Errors.conflict("This request is already decided.");

  if (action === "reject") {
    await db.leaveRequest.update({ where: { id }, data: { status: "REJECTED", rejectReason: opts.reason?.trim() || null, hrId: actor.actorId ?? null, hrAt: new Date() } });
    try { await notify(lr.employee.userId, { title: "Leave rejected", body: `Your leave ${lr.code} was not approved${opts.reason ? ": " + opts.reason : "."}` }); } catch { /* non-blocking */ }
    if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "leave.reject", target: `${lr.employee.employeeCode} ${lr.code}`, ctx: reqContext(ctx) });
    return { id, status: "REJECTED" };
  }

  // approve
  const isHr = opts.asHr !== false;   // admin/HR/accountant approving → final; managers do the first step
  const finalApprove = isHr || lr.status === "MANAGER_APPROVED";
  if (!finalApprove) {
    await db.leaveRequest.update({ where: { id }, data: { status: "MANAGER_APPROVED", managerId: actor.actorId ?? null, managerAt: new Date() } });
    if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "leave.manager_approve", target: `${lr.employee.employeeCode} ${lr.code}`, ctx: reqContext(ctx) });
    return { id, status: "MANAGER_APPROVED" };
  }

  const year = lr.startDate.getFullYear();
  const attStatus = LEAVE_TO_ATTENDANCE[lr.type] ?? "PAID_LEAVE";
  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id }, data: { status: "APPROVED", hrId: actor.actorId ?? null, hrAt: new Date(), managerAt: lr.managerAt ?? new Date() } });

    // LeaveRequest.days is a raw inclusive CALENDAR count, and the attendance loop below used
    // to overwrite every date in the span. So a Fri→Mon casual leave debited 4 days from a
    // 12-day allotment (only 2 are working days) and rewrote Sat/Sun's WEEKLY_OFF rows to
    // PAID_LEAVE — roughly 40% of the yearly entitlement evaporating into weekends.
    // Skip days already marked WEEKLY_OFF / HOLIDAY: don't charge them, don't overwrite them.
    const nonWorking = await tx.attendance.findMany({
      where: { employeeId: lr.employeeId, date: { gte: DAY(lr.startDate), lte: DAY(lr.endDate) }, status: { in: ["WEEKLY_OFF", "HOLIDAY"] } },
      select: { date: true },
    });
    const skip = new Set(nonWorking.map((a) => DAY(a.date).getTime()));

    const leaveDates: Date[] = [];
    for (let t = DAY(lr.startDate).getTime(); t <= DAY(lr.endDate).getTime(); t += 86_400_000) {
      const date = DAY(new Date(t));
      if (!skip.has(date.getTime())) leaveDates.push(date);
    }
    const chargeableDays = leaveDates.length;
    if (chargeableDays !== lr.days) await tx.leaveRequest.update({ where: { id }, data: { days: chargeableDays } });

    // balance (skip LOSS_OF_PAY)
    if (lr.type !== "LOSS_OF_PAY" && chargeableDays > 0) {
      const bal = await tx.leaveBalance.findUnique({ where: { employeeId_year_type: { employeeId: lr.employeeId, year, type: lr.type } } });
      if (bal) await tx.leaveBalance.update({ where: { id: bal.id }, data: { used: bal.used + chargeableDays } });
      else await tx.leaveBalance.create({ data: { employeeId: lr.employeeId, year, type: lr.type, allotted: DEFAULT_ALLOTMENT[lr.type] ?? 0, used: chargeableDays } });
    }
    // mark attendance only on the working days of the leave
    for (const date of leaveDates) {
      await tx.attendance.upsert({ where: { employeeId_date: { employeeId: lr.employeeId, date } }, create: { employeeId: lr.employeeId, date, status: attStatus, note: `Leave ${lr.code}`, correctedById: actor.actorId ?? null }, update: { status: attStatus, note: `Leave ${lr.code}` } });
    }
  });
  try { await notify(lr.employee.userId, { title: "Leave approved ✅", body: `Your ${lr.type.replace(/_/g, " ").toLowerCase()} leave ${lr.code} (${lr.days} day${lr.days === 1 ? "" : "s"}) has been approved.` }); } catch { /* non-blocking */ }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "leave.approve", target: `${lr.employee.employeeCode} ${lr.code} (${lr.days}d)`, ctx: reqContext(ctx) });
  return { id, status: "APPROVED" };
}

/** Per-employee leave balances for a year (creates defaults on first read). */
export async function leaveBalances(employeeId: string, year?: number) {
  const y = year ?? new Date().getFullYear();
  const emp = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { employeeCode: true, user: { select: { name: true } } } });
  if (!emp) throw Errors.notFound("Employee not found.");
  const existing = await db.leaveBalance.findMany({ where: { employeeId, year: y } });
  const byType = new Map(existing.map((b) => [b.type, b]));
  const types: LeaveType[] = ["CASUAL", "SICK", "EARNED", "MATERNITY", "EMERGENCY"];
  return {
    employeeCode: emp.employeeCode, name: emp.user.name, year: y,
    balances: types.map((t) => { const b = byType.get(t); const allotted = b?.allotted ?? DEFAULT_ALLOTMENT[t] ?? 0; const used = b?.used ?? 0; return { type: t, allotted, used, remaining: Math.max(0, allotted - used) }; }),
  };
}
