/* /api/admin/quality/[id]  (id = procurement / batch id)
   GET  — full quality record: results + farmer quality history + inventory impact (quality:view)
   POST — batch approval workflow: { action: "approve" | "reject" } — flips
          Procurement.accepted and keeps raw-milk inventory in sync (quality:edit). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { qualityDetail, approveBatch, rejectBatch } from "@/lib/quality/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.quality.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "quality", "view");
  return ok({ quality: await qualityDetail(params.id) });
});

const schema = z.object({ action: z.enum(["approve", "reject"]) });

export const POST = route("admin.quality.decision", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "quality", "edit");
  const body = await parseBody(req, schema);
  const res = body.action === "approve" ? await approveBatch(params.id, { actorRole: role }) : await rejectBatch(params.id, { actorRole: role });
  await audit({ actorRole: role, action: `quality.${body.action}`, target: params.id, ctx: reqContext(req) });
  return ok({ result: res });
});
