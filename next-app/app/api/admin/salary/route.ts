/* /api/admin/salary — salary structure + salary advances.
   GET  ?view=structure(&employeeId)|advances(&status&q)
   POST { action:"structure"|"advance"|"decide", ... }  ·  RBAC: "payroll". */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { getStructure, setStructure, createAdvance, decideAdvance, listAdvances } from "@/lib/salary/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export const GET = route("admin.salary.get", async (req: NextRequest) => {
  requirePermission(req, "payroll", "view");
  const p = new URL(req.url).searchParams;
  if (p.get("view") === "structure") { const id = p.get("employeeId"); if (!id) throw Errors.badRequest("employeeId required"); return ok({ structure: await getStructure(id) }); }
  return ok(await listAdvances({ status: p.get("status") ?? undefined, employeeId: p.get("employeeId") ?? undefined, q: p.get("q") ?? undefined, page: num(p.get("page")), pageSize: num(p.get("pageSize")) }));
});

const p0 = z.number().int().min(0).max(100_000_000);
const structureSchema = z.object({ action: z.literal("structure"), employeeId: z.string().min(1), basicPaise: p0, hraPaise: p0.optional(), conveyancePaise: p0.optional(), specialPaise: p0.optional(), otherEarnPaise: p0.optional(), ptPaise: p0.optional(), otherDeductPaise: p0.optional(), effectiveFrom: z.string().optional(), note: z.string().max(200).optional() });
const advanceSchema = z.object({ action: z.literal("advance"), employeeId: z.string().min(1), amountPaise: z.number().int().min(1).max(100_000_000), reason: z.string().max(500).optional(), installments: z.number().int().min(1).max(24).optional(), recoveryMethod: z.enum(["SALARY", "LUMPSUM"]).optional() });
const decideSchema = z.object({ action: z.literal("decide"), id: z.string().min(1), decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() });

export const POST = route("admin.salary.post", async (req: NextRequest) => {
  const role = requirePermission(req, "payroll", "edit");
  const body = await parseBody(req, z.union([structureSchema, advanceSchema, decideSchema]));
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  if (body.action === "structure") return ok(await setStructure(body.employeeId, body, actor, req));
  if (body.action === "advance") return ok(await createAdvance(body, actor, req));
  return ok(await decideAdvance(body.id, body.decision, { reason: body.reason }, actor, req));
});
