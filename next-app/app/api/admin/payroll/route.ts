/* /api/admin/payroll — monthly payroll.
   GET  ?view=list(&month&status)|detail(&id)|bank(&month)
   POST { action:"generate"|"finalize"|"pay", ... }  ·  RBAC: "payroll". */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { generatePayroll, listPayslips, payslipDetail, setPayslipStatus, bankReport } from "@/lib/payroll/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export const GET = route("admin.payroll.get", async (req: NextRequest) => {
  requirePermission(req, "payroll", "view");
  const p = new URL(req.url).searchParams;
  const view = p.get("view") ?? "list";
  if (view === "detail") { const id = p.get("id"); if (!id) throw Errors.badRequest("id required"); return ok({ payslip: await payslipDetail(id) }); }
  if (view === "bank") return ok(await bankReport(p.get("month") || new Date().toISOString().slice(0, 7)));
  return ok(await listPayslips({ month: p.get("month") ?? undefined, status: p.get("status") ?? undefined, department: p.get("department") ?? undefined, q: p.get("q") ?? undefined, page: num(p.get("page")), pageSize: num(p.get("pageSize")) }));
});

const genSchema = z.object({ action: z.literal("generate"), month: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.string().optional(), bonusPaise: z.number().int().min(0).optional(), incentivePaise: z.number().int().min(0).optional() });
const statusSchema = z.object({ action: z.enum(["finalize", "pay"]), id: z.string().min(1) });

export const POST = route("admin.payroll.post", async (req: NextRequest) => {
  const role = requirePermission(req, "payroll", "edit");
  const body = await parseBody(req, z.union([genSchema, statusSchema]));
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  if (body.action === "generate") return ok(await generatePayroll(body, actor, req));
  return ok(await setPayslipStatus(body.id, body.action === "finalize" ? "FINALIZED" : "PAID", actor, req));
});
