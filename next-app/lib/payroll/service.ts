/* =============================================================
   DOODLY HR → Payroll (Prisma).
   Monthly payslip per employee: attendance summary + active salary
   structure + salary-advance recovery → gross → deductions → net.
   Draft → Finalized → Paid; advance recovery + the "salary credited"
   notification fire when a payslip is marked PAID. All paise.
   ============================================================= */
import "server-only";
import { Prisma, type PayslipStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { notify } from "@/lib/notifications/dispatch";
import { grossOf } from "@/lib/salary/service";
import type { NextRequest } from "next/server";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string }
const rupees = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");
const monthRange = (month: string) => { const [y, m] = month.split("-").map(Number); if (!y || !m) throw Errors.badRequest("Invalid month (YYYY-MM)."); return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1), days: new Date(y, m, 0).getDate() }; };

async function nextPayslipCode(month: string): Promise<string> {
  const n = await db.payslip.count({ where: { month } });
  return `PS-${month}-${String(n + 1).padStart(4, "0")}`;
}

/** Compute (and DRAFT-persist) one employee's payslip for a month. Idempotent:
 *  updates an existing DRAFT, never overwrites a FINALIZED/PAID slip. */
async function computeOne(employeeId: string, month: string, extras: { bonusPaise?: number; incentivePaise?: number }, actor: Actor) {
  const { start, end, days } = monthRange(month);
  const s = await db.salaryStructure.findFirst({ where: { employeeId, active: true }, orderBy: { effectiveFrom: "desc" } });
  if (!s) return { skipped: "no_salary_structure" as const };
  const existing = await db.payslip.findUnique({ where: { employeeId_month: { employeeId, month } }, select: { id: true, status: true } });
  if (existing && existing.status !== "DRAFT") return { skipped: "already_finalized" as const, id: existing.id };

  const att = await db.attendance.findMany({ where: { employeeId, date: { gte: start, lt: end } }, select: { status: true, overtimeMins: true } });
  let present = 0, half = 0, absent = 0, paidLeave = 0, sickLeave = 0, weeklyOff = 0, holiday = 0, overtimeMins = 0;
  att.forEach((r) => {
    overtimeMins += r.overtimeMins;
    if (r.status === "PRESENT" || r.status === "WFH") present++;
    else if (r.status === "HALF_DAY") half++;
    else if (r.status === "ABSENT") absent++;
    else if (r.status === "PAID_LEAVE") paidLeave++;
    else if (r.status === "SICK_LEAVE") sickLeave++;
    else if (r.status === "WEEKLY_OFF") weeklyOff++;
    else if (r.status === "HOLIDAY") holiday++;
  });
  const lopDays = absent + half * 0.5;                        // unpaid days
  const paidDays = Math.max(0, days - lopDays);
  const proration = days > 0 ? paidDays / days : 1;
  const pr = (p: number) => Math.round(p * proration);
  const basic = pr(s.basicPaise), hra = pr(s.hraPaise), conveyance = pr(s.conveyancePaise), special = pr(s.specialPaise), otherEarn = pr(s.otherEarnPaise);
  const hourlyBasic = s.basicPaise / (days * 8);
  const overtimePay = Math.round((overtimeMins / 60) * hourlyBasic * 1.5);
  const bonus = Math.max(0, extras.bonusPaise ?? 0), incentive = Math.max(0, extras.incentivePaise ?? 0);
  const gross = basic + hra + conveyance + special + otherEarn + overtimePay + bonus + incentive;

  // Advance recovery (planned here; the SalaryAdvance ledger is only decremented at markPaid).
  // Because the ledger lags, any recovery already committed on the employee's OTHER unpaid
  // payslips must be netted off — otherwise generating February before January is PAID plans
  // the SAME installment twice: both payslips dock the employee, but at PAID the ledger only
  // has enough left to recover once. A ₹5,000 advance would take ₹10,000 out of their pay.
  const advances = await db.salaryAdvance.findMany({ where: { employeeId, status: "APPROVED", remainingPaise: { gt: 0 } } });
  const plannedInstalment = advances.reduce((sum, a) => sum + Math.min(a.installmentPaise, a.remainingPaise), 0);
  const totalRemaining = advances.reduce((sum, a) => sum + a.remainingPaise, 0);
  const committedAgg = await db.payslip.aggregate({
    where: { employeeId, status: { in: ["DRAFT", "FINALIZED"] }, ...(existing ? { NOT: { id: existing.id } } : {}) },
    _sum: { advanceRecoverPaise: true },
  });
  const alreadyCommitted = committedAgg._sum.advanceRecoverPaise ?? 0;
  const advanceRecover = Math.max(0, Math.min(plannedInstalment, totalRemaining - alreadyCommitted));

  const deductions = s.ptPaise + s.otherDeductPaise + advanceRecover;
  const net = Math.max(0, gross - deductions);

  const data = {
    workingDays: days, presentDays: present + (weeklyOff + holiday), paidLeaveDays: paidLeave + sickLeave, absentDays: lopDays, overtimeMins,
    basicPaise: basic, hraPaise: hra, conveyancePaise: conveyance, specialPaise: special, incentivePaise: incentive, overtimePaise: overtimePay, bonusPaise: bonus, otherEarnPaise: otherEarn,
    advanceRecoverPaise: advanceRecover, ptPaise: s.ptPaise, otherDeductPaise: s.otherDeductPaise,
    grossPaise: gross, deductionsPaise: deductions, netPaise: net, generatedById: actor.actorId ?? null,
  };
  if (existing) { await db.payslip.update({ where: { id: existing.id }, data }); return { id: existing.id, netPaise: net, regenerated: true }; }
  const ps = await db.payslip.create({ data: { code: await nextPayslipCode(month), employeeId, month, ...data } });
  return { id: ps.id, netPaise: net };
}

/** Generate payroll for one employee or all active employees for a month. */
export async function generatePayroll(a: { month: string; employeeId?: string; bonusPaise?: number; incentivePaise?: number }, actor: Actor, ctx?: NextRequest) {
  monthRange(a.month);
  const ids = a.employeeId ? [a.employeeId] : (await db.employeeProfile.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true } })).map((e) => e.id);
  let generated = 0, skipped = 0;
  for (const id of ids) {
    const r = await computeOne(id, a.month, { bonusPaise: a.employeeId ? a.bonusPaise : 0, incentivePaise: a.employeeId ? a.incentivePaise : 0 }, actor);
    if ("skipped" in r) skipped++; else generated++;
  }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "payroll.generate", target: `${a.month} · ${generated} generated, ${skipped} skipped`, ctx: reqContext(ctx) });
  return { month: a.month, generated, skipped };
}

export async function listPayslips(f: { month?: string; status?: string; department?: string; q?: string; page?: number; pageSize?: number } = {}) {
  const where: Prisma.PayslipWhereInput = {};
  if (f.month) where.month = f.month;
  if (f.status) where.status = f.status as PayslipStatus;
  if (f.department) where.employee = { department: f.department };
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ code: { contains: q, mode: "insensitive" } }, { employee: { employeeCode: { contains: q, mode: "insensitive" } } }, { employee: { user: { name: { contains: q, mode: "insensitive" } } } }]; }
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  const [rows, total, agg] = await Promise.all([
    db.payslip.findMany({ where, orderBy: [{ month: "desc" }, { code: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { employee: { select: { employeeCode: true, department: true, user: { select: { name: true } } } } } }),
    db.payslip.count({ where }),
    db.payslip.aggregate({ where, _sum: { netPaise: true, grossPaise: true, deductionsPaise: true } }),
  ]);
  return {
    rows: rows.map((p) => ({ id: p.id, code: p.code, month: p.month, employeeCode: p.employee.employeeCode, name: p.employee.user.name ?? "—", department: p.employee.department,
      grossPaise: p.grossPaise, deductionsPaise: p.deductionsPaise, netPaise: p.netPaise, status: p.status, paidAt: p.paidAt?.toISOString() ?? null })),
    total, page, pageSize, stats: { count: total, grossPaise: agg._sum.grossPaise ?? 0, deductionsPaise: agg._sum.deductionsPaise ?? 0, netPaise: agg._sum.netPaise ?? 0, draft: rows.filter((r) => r.status === "DRAFT").length },
  };
}

export async function payslipDetail(id: string) {
  const p = await db.payslip.findUnique({ where: { id }, include: { employee: { select: { employeeCode: true, designation: true, department: true, dateOfJoining: true, bankAccount: true, ifsc: true, bankName: true, user: { select: { name: true, phone: true, email: true } } } } } });
  if (!p) throw Errors.notFound("Payslip not found.");
  return {
    id: p.id, code: p.code, month: p.month, status: p.status, paidAt: p.paidAt?.toISOString() ?? null, generatedAt: p.generatedAt.toISOString(),
    employee: { code: p.employee.employeeCode, name: p.employee.user.name, designation: p.employee.designation, department: p.employee.department, doj: p.employee.dateOfJoining.toISOString(), bank: p.employee.bankName, account: p.employee.bankAccount ? "•••• " + p.employee.bankAccount.slice(-4) : null, ifsc: p.employee.ifsc },
    attendance: { workingDays: p.workingDays, presentDays: p.presentDays, paidLeaveDays: p.paidLeaveDays, absentDays: p.absentDays, overtimeMins: p.overtimeMins },
    earnings: { basicPaise: p.basicPaise, hraPaise: p.hraPaise, conveyancePaise: p.conveyancePaise, specialPaise: p.specialPaise, incentivePaise: p.incentivePaise, overtimePaise: p.overtimePaise, bonusPaise: p.bonusPaise, otherEarnPaise: p.otherEarnPaise },
    deductions: { advanceRecoverPaise: p.advanceRecoverPaise, ptPaise: p.ptPaise, otherDeductPaise: p.otherDeductPaise },
    grossPaise: p.grossPaise, deductionsPaise: p.deductionsPaise, netPaise: p.netPaise,
  };
}

export async function setPayslipStatus(id: string, status: "FINALIZED" | "PAID", actor: Actor, ctx?: NextRequest) {
  const p = await db.payslip.findUnique({ where: { id }, include: { employee: { select: { employeeCode: true, userId: true } }, recoveries: { select: { id: true } } } });
  if (!p) throw Errors.notFound("Payslip not found.");
  if (status === "FINALIZED") {
    if (p.status !== "DRAFT") throw Errors.conflict("Only a draft payslip can be finalized.");
    await db.payslip.update({ where: { id }, data: { status: "FINALIZED" } });
    if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "payroll.finalize", target: `${p.employee.employeeCode} ${p.code}`, ctx: reqContext(ctx) });
    return { id, status: "FINALIZED" as const };
  }
  // mark PAID — apply salary-advance recovery once (idempotent via existing recoveries), then notify.
  if (p.status === "PAID") return { id, status: "PAID" as const };
  await db.$transaction(async (tx) => {
    if (!p.recoveries.length && p.advanceRecoverPaise > 0) {
      let toRecover = p.advanceRecoverPaise;
      const advances = await tx.salaryAdvance.findMany({ where: { employeeId: p.employeeId, status: "APPROVED", remainingPaise: { gt: 0 } }, orderBy: { createdAt: "asc" } });
      for (const a of advances) {
        if (toRecover <= 0) break;
        const amt = Math.min(a.installmentPaise, a.remainingPaise, toRecover);
        if (amt <= 0) continue;
        await tx.advanceRecovery.create({ data: { advanceId: a.id, payslipId: id, amountPaise: amt } });
        const remaining = a.remainingPaise - amt;
        await tx.salaryAdvance.update({ where: { id: a.id }, data: { remainingPaise: remaining, recoveredPaise: a.recoveredPaise + amt, status: remaining <= 0 ? "COMPLETED" : "APPROVED" } });
        toRecover -= amt;
      }
    }
    await tx.payslip.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  });
  try { await notify(p.employee.userId, { title: "Salary credited 💰", body: `Your salary for ${p.month} (${rupees(p.netPaise)}) has been paid. Payslip ${p.code} is available.` }); } catch { /* non-blocking */ }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "payroll.paid", target: `${p.employee.employeeCode} ${p.code} ${rupees(p.netPaise)}`, ctx: reqContext(ctx) });
  return { id, status: "PAID" as const };
}

/** Bank-transfer report — net payable per employee for a month (with bank details). */
export async function bankReport(month: string) {
  const rows = await db.payslip.findMany({ where: { month, status: { in: ["FINALIZED", "PAID"] } }, include: { employee: { select: { employeeCode: true, bankAccount: true, ifsc: true, bankName: true, user: { select: { name: true } } } } }, orderBy: { code: "asc" } });
  return { month, total: rows.reduce((s, r) => s + r.netPaise, 0), rows: rows.map((p) => ({ employeeCode: p.employee.employeeCode, name: p.employee.user.name ?? "—", bank: p.employee.bankName, account: p.employee.bankAccount, ifsc: p.employee.ifsc, netPaise: p.netPaise, status: p.status })) };
}
