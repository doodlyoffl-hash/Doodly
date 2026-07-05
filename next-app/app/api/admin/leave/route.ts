/* /api/admin/leave — HR leave management.
   GET  ?view=list(&status&type&q&from&to)|balances(&employeeId&year)
   POST { action:"create"|"approve"|"reject", ... }  ·  RBAC: "leave" module. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { createLeave, listLeaves, decideLeave, leaveBalances } from "@/lib/leave/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export const GET = route("admin.leave.get", async (req: NextRequest) => {
  requirePermission(req, "leave", "view");
  const p = new URL(req.url).searchParams;
  if (p.get("view") === "balances") { const id = p.get("employeeId"); if (!id) throw Errors.badRequest("employeeId required"); return ok(await leaveBalances(id, num(p.get("year")))); }
  return ok(await listLeaves({ status: p.get("status") ?? undefined, type: p.get("type") ?? undefined, employeeId: p.get("employeeId") ?? undefined, q: p.get("q") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, page: num(p.get("page")), pageSize: num(p.get("pageSize")) }));
});

const createSchema = z.object({
  action: z.literal("create"), employeeId: z.string().min(1),
  type: z.enum(["CASUAL", "SICK", "EARNED", "MATERNITY", "EMERGENCY", "LOSS_OF_PAY"]),
  startDate: z.string().min(4), endDate: z.string().min(4), reason: z.string().max(500).optional(), attachmentUrl: z.string().max(400).optional(),
});
const decideSchema = z.object({ action: z.enum(["approve", "reject"]), id: z.string().min(1), reason: z.string().max(500).optional() });

export const POST = route("admin.leave.post", async (req: NextRequest) => {
  const role = requirePermission(req, "leave", "edit");
  const body = await parseBody(req, z.union([createSchema, decideSchema]));
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  if (body.action === "create") return ok(await createLeave(body, actor, req));
  const isHr = role === "admin" || role === "super_admin" || role === "accountant";
  return ok(await decideLeave(body.id, body.action, { reason: body.reason, asHr: isHr }, actor, req));
});
