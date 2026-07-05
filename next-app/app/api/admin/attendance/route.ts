/* /api/admin/attendance — HR attendance.
   GET  ?view=register(&date)|calendar(&employeeId&month)|report(&from&to)
   POST { action:"mark"|"bulk", ... }  ·  RBAC: "attendance" module. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { markAttendance, bulkMark, dailyRegister, monthlyCalendar, attendanceReport } from "@/lib/attendance/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.attendance.get", async (req: NextRequest) => {
  requirePermission(req, "attendance", "view");
  const p = new URL(req.url).searchParams;
  const view = p.get("view") ?? "register";
  const today = new Date().toISOString().slice(0, 10);
  if (view === "calendar") { const id = p.get("employeeId"); if (!id) throw Errors.badRequest("employeeId required"); return ok(await monthlyCalendar(id, p.get("month") || today.slice(0, 7))); }
  if (view === "report") return ok(await attendanceReport({ from: p.get("from") || today, to: p.get("to") || today, department: p.get("department") ?? undefined }));
  return ok(await dailyRegister({ date: p.get("date") || today, department: p.get("department") ?? undefined, q: p.get("q") ?? undefined }));
});

const markSchema = z.object({
  action: z.literal("mark"),
  employeeId: z.string().min(1), date: z.string().min(4),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "PAID_LEAVE", "SICK_LEAVE", "WEEKLY_OFF", "HOLIDAY", "WFH"]),
  checkIn: z.string().optional(), checkOut: z.string().optional(), note: z.string().max(200).optional(), source: z.string().max(20).optional(),
});
const bulkSchema = z.object({
  action: z.literal("bulk"), date: z.string().min(4), employeeIds: z.array(z.string()).min(1).max(1000),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "PAID_LEAVE", "SICK_LEAVE", "WEEKLY_OFF", "HOLIDAY", "WFH"]),
});

export const POST = route("admin.attendance.post", async (req: NextRequest) => {
  const role = requirePermission(req, "attendance", "edit");
  const body = await parseBody(req, z.union([markSchema, bulkSchema]));
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  if (body.action === "bulk") return ok(await bulkMark(body, actor, req));
  return ok(await markAttendance(body, actor, req));
});
