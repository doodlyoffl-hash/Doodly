/* =============================================================
   DOODLY HR → Attendance — service layer (Prisma).
   Daily attendance per employee (unique [employeeId, date]); manual
   entry, admin correction, and bulk marking. Reuses EmployeeProfile;
   every write audited. Future-ready sources (GPS/Biometric/QR) via the
   AttendanceSource enum. All times server-computed (worked/overtime).
   ============================================================= */
import "server-only";
import { Prisma, type AttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import type { NextRequest } from "next/server";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string }
const DAY = (d: string | Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const STANDARD_MINS = 8 * 60;
const PRESENT_LIKE: AttendanceStatus[] = ["PRESENT", "HALF_DAY", "WFH"];

function minutesBetween(inISO?: string | null, outISO?: string | null) {
  if (!inISO || !outISO) return { worked: 0, overtime: 0 };
  const a = new Date(inISO).getTime(), b = new Date(outISO).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return { worked: 0, overtime: 0 };
  const worked = Math.round((b - a) / 60000);
  return { worked, overtime: Math.max(0, worked - STANDARD_MINS) };
}

/** Mark / correct one day's attendance (idempotent upsert on [employeeId, date]). */
export async function markAttendance(a: { employeeId: string; date: string; status: string; checkIn?: string; checkOut?: string; note?: string; source?: string }, actor: Actor, ctx?: NextRequest) {
  const emp = await db.employeeProfile.findUnique({ where: { id: a.employeeId }, select: { id: true, employeeCode: true } });
  if (!emp || !emp) throw Errors.notFound("Employee not found.");
  const date = DAY(a.date);
  const { worked, overtime } = minutesBetween(a.checkIn, a.checkOut);
  const data = {
    status: a.status as AttendanceStatus,
    checkIn: a.checkIn ? new Date(a.checkIn) : null, checkOut: a.checkOut ? new Date(a.checkOut) : null,
    workedMins: worked, overtimeMins: overtime, note: a.note?.trim() || null,
    source: (a.source as Prisma.AttendanceCreateInput["source"]) ?? "MANUAL", correctedById: actor.actorId ?? null,
  };
  const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: a.employeeId, date } }, select: { id: true, status: true } });
  const row = await db.attendance.upsert({
    where: { employeeId_date: { employeeId: a.employeeId, date } },
    create: { employeeId: a.employeeId, date, ...data },
    update: data,
  });
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: existing ? "attendance.correct" : "attendance.mark", target: `${emp.employeeCode} ${a.date} → ${a.status}${existing ? ` (was ${existing.status})` : ""}`, ctx: reqContext(ctx) });
  return { id: row.id };
}

/** Bulk-mark a status for many employees on one date (e.g. WEEKLY_OFF / HOLIDAY / PRESENT). */
export async function bulkMark(a: { date: string; employeeIds: string[]; status: string }, actor: Actor, ctx?: NextRequest) {
  const date = DAY(a.date);
  let n = 0;
  for (const employeeId of a.employeeIds.slice(0, 1000)) {
    try {
      await db.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: { employeeId, date, status: a.status as AttendanceStatus, source: "MANUAL", correctedById: actor.actorId ?? null },
        update: { status: a.status as AttendanceStatus, correctedById: actor.actorId ?? null },
      });
      n++;
    } catch { /* skip bad ids */ }
  }
  if (ctx) await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole, action: "attendance.bulk", target: `${n} employees ${a.date} → ${a.status}`, ctx: reqContext(ctx) });
  return { marked: n };
}

/** Daily register — every active employee for a date with their marked status (or unmarked). */
export async function dailyRegister(a: { date: string; department?: string; q?: string }) {
  const date = DAY(a.date);
  const where: Prisma.EmployeeProfileWhereInput = { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } };
  if (a.department) where.department = a.department;
  if (a.q?.trim()) { const q = a.q.trim(); where.OR = [{ employeeCode: { contains: q, mode: "insensitive" } }, { user: { name: { contains: q, mode: "insensitive" } } }]; }
  const emps = await db.employeeProfile.findMany({ where, orderBy: { employeeCode: "asc" }, take: 500, select: { id: true, employeeCode: true, department: true, designation: true, user: { select: { name: true } } } });
  const att = await db.attendance.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, date }, select: { employeeId: true, status: true, checkIn: true, checkOut: true, workedMins: true, overtimeMins: true, note: true } });
  const by = new Map(att.map((r) => [r.employeeId, r]));
  const rows = emps.map((e) => {
    const r = by.get(e.id);
    return { employeeId: e.id, employeeCode: e.employeeCode, name: e.user.name ?? "—", department: e.department, designation: e.designation,
      status: r?.status ?? null, checkIn: r?.checkIn?.toISOString() ?? null, checkOut: r?.checkOut?.toISOString() ?? null,
      workedMins: r?.workedMins ?? 0, overtimeMins: r?.overtimeMins ?? 0, note: r?.note ?? null };
  });
  const counts = { present: 0, absent: 0, leave: 0, off: 0, unmarked: 0 };
  rows.forEach((r) => {
    if (!r.status) counts.unmarked++;
    else if (PRESENT_LIKE.includes(r.status)) counts.present++;
    else if (r.status === "ABSENT") counts.absent++;
    else if (r.status === "PAID_LEAVE" || r.status === "SICK_LEAVE") counts.leave++;
    else counts.off++;
  });
  return { date: a.date, rows, counts, total: rows.length };
}

/** Per-employee monthly calendar (YYYY-MM) — a status per day + a summary. */
export async function monthlyCalendar(employeeId: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw Errors.badRequest("Invalid month (use YYYY-MM).");
  const start = new Date(y, m - 1, 1), end = new Date(y, m, 1);
  const emp = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { employeeCode: true, user: { select: { name: true } } } });
  if (!emp) throw Errors.notFound("Employee not found.");
  const rows = await db.attendance.findMany({ where: { employeeId, date: { gte: start, lt: end } }, select: { date: true, status: true, workedMins: true, overtimeMins: true, checkIn: true, checkOut: true } });
  const byDay = new Map(rows.map((r) => [r.date.getDate(), r]));
  const days = [];
  const summary = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, sickLeave: 0, weeklyOff: 0, holiday: 0, wfh: 0, overtimeMins: 0 };
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const r = byDay.get(d);
    days.push({ day: d, status: r?.status ?? null, workedMins: r?.workedMins ?? 0, overtimeMins: r?.overtimeMins ?? 0 });
    if (r) {
      summary.overtimeMins += r.overtimeMins;
      const k = { PRESENT: "present", ABSENT: "absent", HALF_DAY: "halfDay", PAID_LEAVE: "paidLeave", SICK_LEAVE: "sickLeave", WEEKLY_OFF: "weeklyOff", HOLIDAY: "holiday", WFH: "wfh" }[r.status] as keyof typeof summary;
      if (k) (summary[k] as number)++;
    }
  }
  return { employeeCode: emp.employeeCode, name: emp.user.name, month, days, summary };
}

/** Attendance report — per-employee present/absent/leave counts over a date range. */
export async function attendanceReport(a: { from: string; to: string; department?: string }) {
  const start = DAY(a.from), end = new Date(DAY(a.to).getTime() + 86_400_000);
  const empWhere: Prisma.EmployeeProfileWhereInput = { deletedAt: null };
  if (a.department) empWhere.department = a.department;
  const emps = await db.employeeProfile.findMany({ where: empWhere, select: { id: true, employeeCode: true, department: true, user: { select: { name: true } } }, take: 1000 });
  const att = await db.attendance.groupBy({ by: ["employeeId", "status"], where: { employeeId: { in: emps.map((e) => e.id) }, date: { gte: start, lt: end } }, _count: { _all: true }, _sum: { overtimeMins: true } });
  const map = new Map<string, Record<string, number>>();
  att.forEach((r) => { const m = map.get(r.employeeId) ?? {}; m[r.status] = r._count._all; m.overtime = (m.overtime ?? 0) + (r._sum.overtimeMins ?? 0); map.set(r.employeeId, m); });
  return {
    from: a.from, to: a.to,
    rows: emps.map((e) => { const m = map.get(e.id) ?? {}; const present = (m.PRESENT ?? 0) + (m.WFH ?? 0) + (m.HALF_DAY ?? 0) * 0.5;
      return { employeeCode: e.employeeCode, name: e.user.name ?? "—", department: e.department,
        present: (m.PRESENT ?? 0) + (m.WFH ?? 0), halfDay: m.HALF_DAY ?? 0, absent: m.ABSENT ?? 0,
        paidLeave: m.PAID_LEAVE ?? 0, sickLeave: m.SICK_LEAVE ?? 0, weeklyOff: m.WEEKLY_OFF ?? 0, holiday: m.HOLIDAY ?? 0,
        overtimeMins: m.overtime ?? 0, payableDays: present + (m.PAID_LEAVE ?? 0) + (m.SICK_LEAVE ?? 0) }; }),
  };
}
