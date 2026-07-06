/* /api/account/hr — the signed-in EMPLOYEE's own HR self-service.
   Identity is taken from the authenticated User (never the client). A user
   with no EmployeeProfile gets { isEmployee:false } (not an error), so the
   storefront can hide the surface gracefully. Employees see only FINALIZED/PAID
   payslips (drafts are internal). Reuses the same services as the admin side.
   GET  ?view=summary|attendance(&month)|payslips|payslip(&id)|advances|leave
   POST { action:"apply-leave", type, startDate, endDate, reason? } */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { monthlyCalendar } from "@/lib/attendance/service";
import { createLeave, listLeaves, leaveBalances } from "@/lib/leave/service";
import { listAdvances } from "@/lib/salary/service";
import { payslipDetail } from "@/lib/payroll/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function selfEmployee(userId: string) {
  return db.employeeProfile.findFirst({ where: { userId, deletedAt: null }, select: { id: true, employeeCode: true, designation: true, department: true, dateOfJoining: true, employmentType: true, status: true, user: { select: { name: true, email: true, phone: true } } } });
}
function ownPayslips(employeeId: string) {
  return db.payslip.findMany({ where: { employeeId, status: { in: ["FINALIZED", "PAID"] } }, orderBy: { month: "desc" }, take: 24, select: { id: true, code: true, month: true, grossPaise: true, deductionsPaise: true, netPaise: true, status: true, paidAt: true } });
}

export const GET = route("account.hr.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const emp = await selfEmployee(userId);
  if (!emp) return ok({ isEmployee: false });
  const p = new URL(req.url).searchParams;
  const view = p.get("view") ?? "summary";

  if (view === "attendance") return ok({ isEmployee: true, calendar: await monthlyCalendar(emp.id, p.get("month") || new Date().toISOString().slice(0, 7)) });
  if (view === "payslips") return ok({ isEmployee: true, payslips: await ownPayslips(emp.id) });
  if (view === "payslip") {
    const id = p.get("id"); if (!id) throw Errors.badRequest("id required");
    const owned = await db.payslip.findFirst({ where: { id, employeeId: emp.id, status: { in: ["FINALIZED", "PAID"] } }, select: { id: true } });
    if (!owned) throw Errors.notFound("Payslip not found.");
    return ok({ isEmployee: true, payslip: await payslipDetail(id) });
  }
  if (view === "advances") { const a = await listAdvances({ employeeId: emp.id, pageSize: 100 }); return ok({ isEmployee: true, advances: a.rows, stats: a.stats }); }
  if (view === "leave") return ok({ isEmployee: true, balances: await leaveBalances(emp.id), requests: (await listLeaves({ employeeId: emp.id, pageSize: 100 })).rows });

  // summary
  const [balances, payslips, advances] = await Promise.all([leaveBalances(emp.id), ownPayslips(emp.id), listAdvances({ employeeId: emp.id, pageSize: 100 })]);
  return ok({
    isEmployee: true,
    employee: { code: emp.employeeCode, name: emp.user.name, email: emp.user.email, phone: emp.user.phone, designation: emp.designation, department: emp.department, employmentType: emp.employmentType, status: emp.status, doj: emp.dateOfJoining.toISOString() },
    leaveBalances: balances, latestPayslip: payslips[0] ?? null,
    advances: { outstandingPaise: advances.stats.outstandingPaise, active: advances.rows.filter((a) => a.status === "APPROVED").length },
  });
});

const applySchema = z.object({ action: z.literal("apply-leave"), type: z.string().min(1), startDate: z.string().min(1), endDate: z.string().min(1), reason: z.string().max(500).optional() });

export const POST = route("account.hr.post", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const emp = await selfEmployee(userId);
  if (!emp) throw Errors.forbidden("You don't have an employee profile.");
  const body = await parseBody(req, applySchema);
  const res = await createLeave({ employeeId: emp.id, type: body.type, startDate: body.startDate, endDate: body.endDate, reason: body.reason }, { actorId: userId, actorRole: readRole(req) }, req);
  return ok(res);
});
