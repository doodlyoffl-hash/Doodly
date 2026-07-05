/* /api/admin/employees — HR Employee Master.
   GET  ?view=list|dashboard|managers  (list supports q/department/status/type/page)
   POST create employee (+ backing staff User). RBAC: "employees" module. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { listEmployees, createEmployee, hrDashboard, managerOptions } from "@/lib/employees/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export const GET = route("admin.employees.list", async (req: NextRequest) => {
  requirePermission(req, "employees", "view");
  const p = new URL(req.url).searchParams;
  const view = p.get("view") ?? "list";
  if (view === "dashboard") return ok(await hrDashboard());
  if (view === "managers") return ok({ managers: await managerOptions() });
  return ok(await listEmployees({
    q: p.get("q") ?? undefined, department: p.get("department") ?? undefined, status: p.get("status") ?? undefined,
    employmentType: p.get("type") ?? undefined, page: num(p.get("page")), pageSize: num(p.get("pageSize")),
  }));
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone").optional().or(z.literal("").transform(() => undefined)),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("").transform(() => undefined)),
  role: z.string().trim().max(30).optional(),
  department: z.string().trim().min(1, "Department is required").max(60),
  designation: z.string().trim().min(1, "Designation is required").max(80),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]).optional(),
  dateOfJoining: z.string().min(4, "Date of joining is required"),
  reportingManagerId: z.string().trim().max(40).optional().or(z.literal("")),
  workLocation: z.string().trim().max(120).optional().or(z.literal("")),
  altPhone: z.string().trim().max(20).optional().or(z.literal("")),
  dob: z.string().max(40).optional().or(z.literal("")),
  gender: z.string().trim().max(20).optional().or(z.literal("")),
  bloodGroup: z.string().trim().max(10).optional().or(z.literal("")),
  emergencyName: z.string().trim().max(80).optional().or(z.literal("")),
  emergencyPhone: z.string().trim().max(20).optional().or(z.literal("")),
  aadhaar: z.string().trim().max(20).optional().or(z.literal("")),
  pan: z.string().trim().max(20).optional().or(z.literal("")),
  drivingLicence: z.string().trim().max(30).optional().or(z.literal("")),
  bankAccount: z.string().trim().max(30).optional().or(z.literal("")),
  ifsc: z.string().trim().max(20).optional().or(z.literal("")),
  bankName: z.string().trim().max(60).optional().or(z.literal("")),
  upiId: z.string().trim().max(60).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"]).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  userId: z.string().trim().max(40).optional().or(z.literal("")),
});

export const POST = route("admin.employees.create", async (req: NextRequest) => {
  const role = requirePermission(req, "employees", "create");
  const body = await parseBody(req, createSchema);
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqContext(req).ip };
  const res = await createEmployee(body, actor, req);
  return ok({ employee: res }, { status: 201 });
});
