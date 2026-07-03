/* /api/admin/deliveries/[id]/issue — delivery issue reports.
   GET  — list issues for the delivery (deliveries:view)
   POST — log an issue (deliveries:edit), audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listDeliveryIssues, reportDeliveryIssue } from "@/lib/delivery/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.deliveries.issues.list", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "deliveries", "view");
  return ok({ issues: await listDeliveryIssues(params.id) });
});

const schema = z.object({
  type: z.enum(["CUSTOMER_UNAVAILABLE", "WRONG_ADDRESS", "DAMAGED_BOTTLE", "PAYMENT_ISSUE", "PRODUCT_ISSUE", "DELIVERY_FAILED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  comments: z.string().max(500).optional(),
});

export const POST = route("admin.deliveries.issues.create", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, schema);
  const issue = await reportDeliveryIssue(params.id, body, { actorRole: role });
  await audit({ actorRole: role, action: `delivery.issue.${body.type.toLowerCase()}`, target: params.id, ctx: reqContext(req) });
  return ok({ issue });
});
